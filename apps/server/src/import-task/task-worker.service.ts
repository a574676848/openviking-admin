import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DataSource, Repository, type QueryRunner } from 'typeorm';
import { OPENVIKING_RESOURCE_ENDPOINTS, QUEUE_CONFIG } from './constants';
import { OVClientService } from '../common/ov-client.service';
import { DynamicDataSourceService } from '../common/dynamic-datasource.service';
import { EncryptionService } from '../common/encryption.service';
import { FeishuIntegrator } from './strategies/feishu.integrator';
import { DingTalkIntegrator } from './strategies/dingtalk.integrator';
import { GitIntegrator } from './strategies/git.integrator';
import { ImportTask } from './entities/import-task.entity';
import type { ImportTaskModel } from './domain/import-task.model';
import type { PlatformInjectConfig } from './strategies/platform-integrator.interface';
import { Integration } from '../tenant/entities/integration.entity';
import type { IntegrationModel } from '../tenant/domain/integration.model';
import { LocalImportStorageService } from './local-import-storage.service';
import {
  TaskStatus,
  TenantIsolationLevel,
  TenantStatus,
} from '../common/constants/system.enum';
import { Tenant } from '../tenant/entities/tenant.entity';
import type { TenantModel } from '../tenant/domain/tenant.model';
import { OvConfigResolverService } from '../settings/ov-config-resolver.service';
import { buildTenantIdentityWhere } from '../tenant/tenant-identity.util';

interface TenantTaskContext {
  taskRepo: Repository<ImportTask>;
  integrationRepo: Repository<Integration>;
  release: () => Promise<void>;
}

@Injectable()
export class TaskWorkerService implements OnModuleInit {
  private readonly logger = new Logger(TaskWorkerService.name);
  private currentConcurrency = 0;
  private isPolling = false;
  private readonly SENSITIVE_KEYS = [
    'token',
    'password',
    'appSecret',
    'clientSecret',
  ];

  constructor(
    private readonly defaultDataSource: DataSource,
    private readonly dynamicDS: DynamicDataSourceService,
    private readonly ovConfigResolver: OvConfigResolverService,
    private readonly encryption: EncryptionService,
    private readonly ovClient: OVClientService,
    private readonly feishu: FeishuIntegrator,
    private readonly dingtalk: DingTalkIntegrator,
    private readonly git: GitIntegrator,
    private readonly localImportStorage: LocalImportStorageService,
  ) {}

  async onModuleInit() {
    this.logger.log('Initializing TaskWorker: Running cleanup...');
    await this.recoverZombieTasks();
    this.startWorker();
  }

  private async recoverZombieTasks() {
    const zombies = await this.findTasksByStatus(TaskStatus.RUNNING);
    const runningZombies = zombies.filter((t) => t.status === 'running');

    if (runningZombies.length > 0) {
      this.logger.warn(
        `Recovered ${runningZombies.length} zombie tasks from previous run.`,
      );
      for (const task of runningZombies) {
        await this.updateTaskStatus(task, TaskStatus.PENDING);
      }
    }
  }

  private startWorker() {
    setInterval(() => {
      void this.poll();
    }, QUEUE_CONFIG.POLLING_INTERVAL_MS);
  }

  private async poll() {
    if (
      this.isPolling ||
      this.currentConcurrency >= QUEUE_CONFIG.GLOBAL_MAX_CONCURRENCY
    )
      return;
    this.isPolling = true;

    try {
      const pendingTasks = (await this.findTasksByStatus(TaskStatus.PENDING))
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .slice(
          0,
          QUEUE_CONFIG.GLOBAL_MAX_CONCURRENCY - this.currentConcurrency,
        );

      for (const task of pendingTasks) {
        if (this.currentConcurrency < QUEUE_CONFIG.GLOBAL_MAX_CONCURRENCY) {
          void this.processTask(task);
        }
      }
    } finally {
      this.isPolling = false;
    }
  }

  private async processTask(task: ImportTaskModel) {
    this.currentConcurrency++;
    let tenant: TenantModel | null = null;

    try {
      const currentTenant = await this.findTenantForTask(task);
      tenant = currentTenant;
      await this.withTenantTaskContext(currentTenant, async (context) => {
        await context.taskRepo.update(task.id, {
          status: TaskStatus.RUNNING,
          updatedAt: new Date(),
        });

        this.logger.log(
          `>> [Task:${task.id.slice(0, 8)}] Processing ${task.sourceType} pipe...`,
        );
        const rawConn = await this.ovConfigResolver.resolve(
          currentTenant.tenantId,
        );
        const conn = {
          baseUrl: rawConn.baseUrl || '',
          apiKey: rawConn.apiKey || '',
          account: rawConn.account || 'default',
          user: rawConn.user || '',
          rerankEndpoint: rawConn.rerankEndpoint || '',
          rerankModel: rawConn.rerankModel || '',
        };

        const injectBody: Record<string, unknown> = {
          path: task.sourceUrl,
          to: this.toEngineResourceUri(task.targetUri),
          reason: `Queue Task: ${task.id}`,
          wait: true,
        };

        if (task.integrationId) {
          const integration = await this.findIntegration(
            context.integrationRepo,
            task.integrationId,
            currentTenant.tenantId,
          );
          const integrators = [this.feishu, this.dingtalk, this.git];
          const strategy = integrators.find((s) =>
            s.supports(integration.type),
          );

          if (strategy) {
            const resolved: PlatformInjectConfig = await strategy.resolveConfig(
              integration,
              task.sourceUrl,
            );
            if (resolved.tempFile) {
              injectBody.temp_file_id = await this.uploadPlatformTempFile(
                conn,
                resolved.tempFile,
              );
              injectBody.wait = false;
              delete injectBody.path;
            } else if (resolved.path) {
              injectBody.path = resolved.path;
            }
            await this.injectResourceWithPaths(
              conn,
              injectBody,
              resolved.fallbackPaths ?? [],
            );
          }
        } else if (task.sourceType === 'local') {
          injectBody.temp_file_id = await this.uploadLocalTempFile(
            conn,
            task,
          );
          delete injectBody.path;
          await this.injectResourceWithPaths(conn, injectBody);
        } else {
          await this.injectResourceWithPaths(conn, injectBody);
        }

        const resourceStats = await this.fetchResourceStats(
          conn,
          this.toEngineResourceUri(task.targetUri),
        );

        await context.taskRepo.update(task.id, {
          status: TaskStatus.DONE,
          ...resourceStats,
          updatedAt: new Date(),
        });
        await this.cleanupLocalFileAfterDone(task);
      });
      this.logger.log(
        `<< [Task:${task.id.slice(0, 8)}] Successfully ingested.`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : '未知错误';
      this.logger.error(
        `!! [Task:${task.id.slice(0, 8)}] Fatal failure: ${message}`,
      );
      if (tenant) {
        await this.markTaskFailed(tenant, task.id, message);
      }
    } finally {
      this.currentConcurrency--;
    }
  }

  private async findTasksByStatus(
    status: TaskStatus,
  ): Promise<ImportTaskModel[]> {
    const tenants = await this.findActiveTenants();
    const tasks: ImportTaskModel[] = [];

    for (const tenant of tenants) {
      await this.withTenantTaskContext(tenant, async (context) => {
        const items = await context.taskRepo.find({
          where: { tenantId: tenant.tenantId, status },
          order: { createdAt: 'ASC' },
        });
        tasks.push(...items.map((item) => this.toTaskModel(item)));
      }).catch((error) => {
        const message = error instanceof Error ? error.message : '未知错误';
        this.logger.warn(
          `Skip import task polling for tenant [${tenant.tenantId}]: ${message}`,
        );
      });
    }

    return tasks;
  }

  private async cleanupLocalFileAfterDone(task: ImportTaskModel) {
    if (
      task.sourceType !== 'local' ||
      !this.localImportStorage.shouldCleanupAfterDone() ||
      !this.localImportStorage.isManagedFileUrl(task.sourceUrl)
    ) {
      return;
    }

    await this.localImportStorage.deleteBySourceUrl(task.sourceUrl);
  }

  private async fetchResourceStats(
    conn: {
      baseUrl: string;
      apiKey: string;
      account: string;
      user: string;
    },
    targetUri: string,
  ) {
    try {
      const statData = await this.ovClient.request(
        conn,
        `/api/v1/fs/stat?uri=${encodeURIComponent(targetUri)}`,
        'GET',
        undefined,
        { user: conn.user || undefined },
      );
      const statResult = statData?.result as
        | Record<string, unknown>
        | undefined;
      let nodeCount = this.resolveNodeCountFromStat(statResult);
      if (nodeCount === null) {
        const treeData = await this.ovClient.request(
          conn,
          `/api/v1/fs/tree?uri=${encodeURIComponent(targetUri)}&depth=2`,
          'GET',
          undefined,
          { user: conn.user || undefined },
        );
        nodeCount = this.countTreeItems(treeData?.result);
      }

      const vecData = await this.ovClient.request(
        conn,
        `/api/v1/debug/vector/count?uri=${encodeURIComponent(targetUri)}`,
        'GET',
        undefined,
        { user: conn.user || undefined },
      );
      const vecResult = vecData?.result as Record<string, unknown> | undefined;

      if (!statResult && !vecResult) {
        return {};
      }

      return {
        nodeCount,
        vectorCount: this.toNonNegativeNumber(vecResult?.count),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      this.logger.warn(`同步导入任务资源统计失败: ${message}`);
      return {};
    }
  }

  private async injectResourceWithPaths(
    conn: {
      baseUrl: string;
      apiKey: string;
      account: string;
      user: string;
    },
    injectBody: Record<string, unknown>,
    fallbackPaths: string[] = [],
  ) {
    const firstPath = typeof injectBody.path === 'string'
      ? injectBody.path
      : null;
    const paths = firstPath ? [firstPath, ...fallbackPaths] : [null];
    let lastError: unknown = null;

    for (const path of paths) {
      const body = { ...injectBody };
      if (path) {
        body.path = path;
      }
      const result = await this.ovClient.request(
        conn,
        OPENVIKING_RESOURCE_ENDPOINTS.INJECT,
        'POST',
        body,
        { user: conn.user || undefined },
      ).catch((error) => {
        lastError = error;
        return null;
      });

      if (!result) {
        continue;
      }

      try {
        this.assertInjectSucceeded(result);
        return;
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error('OpenViking 资源注入失败');
  }

  private async uploadLocalTempFile(
    conn: {
      baseUrl: string;
      apiKey: string;
      account: string;
      user: string;
    },
    task: ImportTaskModel,
  ) {
    const file = await this.localImportStorage.readBySourceUrl(task.sourceUrl);
    const response = await this.ovClient.uploadTempFile(
      conn,
      OPENVIKING_RESOURCE_ENDPOINTS.TEMP_UPLOAD,
      {
        fileName: file.fileName,
        buffer: file.buffer,
        mimeType: file.mimeType,
      },
      { user: conn.user || undefined },
      { serviceLabel: 'OpenViking Resources' },
    );
    return this.extractTempFileId(response);
  }

  private async uploadPlatformTempFile(
    conn: {
      baseUrl: string;
      apiKey: string;
      account: string;
      user: string;
    },
    file: {
      fileName: string;
      buffer: Buffer;
      mimeType: string | null;
    },
  ) {
    const response = await this.ovClient.uploadTempFile(
      conn,
      OPENVIKING_RESOURCE_ENDPOINTS.TEMP_UPLOAD,
      file,
      { user: conn.user || undefined },
      { serviceLabel: 'OpenViking Resources' },
    );
    return this.extractTempFileId(response);
  }

  private extractTempFileId(response: unknown) {
    const result =
      response && typeof response === 'object'
        ? (response as { result?: unknown }).result
        : null;
    const tempFileId =
      result && typeof result === 'object'
        ? (result as { temp_file_id?: unknown }).temp_file_id
        : null;
    if (typeof tempFileId !== 'string' || tempFileId.trim().length === 0) {
      throw new Error('OpenViking 临时文件上传未返回 temp_file_id');
    }
    return tempFileId;
  }

  private toNonNegativeNumber(value: unknown) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }

  private resolveNodeCountFromStat(statResult: Record<string, unknown> | undefined) {
    if (
      statResult?.children_count === undefined &&
      statResult?.descendant_count === undefined
    ) {
      return null;
    }

    return (
      this.toNonNegativeNumber(statResult.children_count) +
      this.toNonNegativeNumber(statResult.descendant_count)
    );
  }

  private countTreeItems(result: unknown) {
    return Array.isArray(result) ? result.length : 0;
  }

  private async updateTaskStatus(
    task: ImportTaskModel,
    status: TaskStatus,
  ): Promise<void> {
    const tenant = await this.findTenantForTask(task);
    await this.withTenantTaskContext(tenant, async (context) => {
      await context.taskRepo.update(task.id, {
        status,
        updatedAt: new Date(),
      });
    });
  }

  private async markTaskFailed(
    tenant: TenantModel,
    taskId: string,
    errorMsg: string,
  ): Promise<void> {
    await this.withTenantTaskContext(tenant, async (context) => {
      await context.taskRepo.update(taskId, {
        status: TaskStatus.FAILED,
        nodeCount: 0,
        vectorCount: 0,
        errorMsg,
        updatedAt: new Date(),
      });
    }).catch((error) => {
      const message = error instanceof Error ? error.message : '未知错误';
      this.logger.error(`Mark import task failed error: ${message}`);
    });
  }

  private async findActiveTenants(): Promise<TenantModel[]> {
    const tenants = await this.defaultDataSource.getRepository(Tenant).find({
      where: { status: TenantStatus.ACTIVE },
      order: { createdAt: 'ASC' },
    });
    return tenants.map((tenant) => this.toTenantModel(tenant));
  }

  private async findTenantForTask(task: ImportTaskModel): Promise<TenantModel> {
    const tenant = await this.defaultDataSource.getRepository(Tenant).findOne({
      where: buildTenantIdentityWhere(task.tenantId),
    });
    if (!tenant) {
      throw new Error(`导入任务缺少有效租户上下文：${task.tenantId}`);
    }
    return this.toTenantModel(tenant);
  }

  private async withTenantTaskContext<T>(
    tenant: TenantModel,
    handler: (context: TenantTaskContext) => Promise<T>,
  ): Promise<T> {
    const context = await this.createTenantTaskContext(tenant);
    try {
      return await handler(context);
    } finally {
      await context.release();
    }
  }

  private async createTenantTaskContext(
    tenant: TenantModel,
  ): Promise<TenantTaskContext> {
    if (tenant.isolationLevel === TenantIsolationLevel.LARGE) {
      if (!tenant.dbConfig) {
        throw new Error(`LARGE 租户缺少独立库配置：${tenant.tenantId}`);
      }
      const dataSource = await this.dynamicDS.getTenantDataSource(
        tenant.tenantId,
        tenant.dbConfig,
      );
      return {
        taskRepo: dataSource.getRepository(ImportTask),
        integrationRepo: dataSource.getRepository(Integration),
        release: async () => undefined,
      };
    }

    if (tenant.isolationLevel === TenantIsolationLevel.MEDIUM) {
      const queryRunner = this.defaultDataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.query(
        `SET search_path TO "${this.buildTenantSchemaName(tenant.tenantId)}", public`,
      );
      return this.createQueryRunnerContext(queryRunner);
    }

    return {
      taskRepo: this.defaultDataSource.getRepository(ImportTask),
      integrationRepo: this.defaultDataSource.getRepository(Integration),
      release: async () => undefined,
    };
  }

  private createQueryRunnerContext(
    queryRunner: QueryRunner,
  ): TenantTaskContext {
    return {
      taskRepo: queryRunner.manager.getRepository(ImportTask),
      integrationRepo: queryRunner.manager.getRepository(Integration),
      release: async () => {
        if (!queryRunner.isReleased) {
          await queryRunner.release();
        }
      },
    };
  }

  private buildTenantSchemaName(tenantId: string): string {
    return `tenant_${tenantId.replace(/-/g, '_')}`;
  }

  private toEngineResourceUri(uri: string): string {
    const prefix = 'viking://resources/';
    const tenantPrefix = 'viking://resources/tenants/';
    if (uri.startsWith(tenantPrefix)) {
      return uri;
    }
    if (!uri.startsWith(prefix)) {
      return uri;
    }

    return `${tenantPrefix}${uri.slice(prefix.length)}`;
  }

  private assertInjectSucceeded(response: unknown): void {
    if (!response || typeof response !== 'object') {
      return;
    }

    const result = (response as { result?: unknown }).result;
    if (!result || typeof result !== 'object') {
      return;
    }

    const status = (result as { status?: unknown }).status;
    if (status !== 'error') {
      return;
    }

    const errors = (result as { errors?: unknown }).errors;
    const message = Array.isArray(errors) && errors.length > 0
      ? errors.map((item) => String(item)).join('; ')
      : 'OpenViking 资源注入失败';
    throw new Error(message);
  }

  private async findIntegration(
    integrationRepo: Repository<Integration>,
    id: string,
    tenantId: string,
  ): Promise<IntegrationModel> {
    const integration = await integrationRepo.findOne({
      where: { id, tenantId },
    });
    if (!integration) {
      throw new Error('集成配置不存在');
    }
    return this.decryptIntegration(this.toIntegrationModel(integration));
  }

  private decryptIntegration(integration: IntegrationModel): IntegrationModel {
    const credentials = { ...integration.credentials };
    for (const key of this.SENSITIVE_KEYS) {
      if (credentials[key]) {
        credentials[key] = this.encryption.decrypt(credentials[key]);
      }
    }
    return { ...integration, credentials };
  }

  private toTaskModel(entity: ImportTask): ImportTaskModel {
    return {
      id: entity.id,
      tenantId: entity.tenantId,
      integrationId: entity.integrationId,
      kbId: entity.kbId,
      sourceType: entity.sourceType,
      sourceUrl: entity.sourceUrl,
      targetUri: entity.targetUri,
      status: entity.status,
      nodeCount: entity.nodeCount,
      vectorCount: entity.vectorCount,
      errorMsg: entity.errorMsg,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }

  private toIntegrationModel(entity: Integration): IntegrationModel {
    return {
      id: entity.id,
      tenantId: entity.tenantId,
      name: entity.name,
      type: entity.type,
      credentials: entity.credentials,
      config: entity.config,
      active: entity.active,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }

  private toTenantModel(entity: Tenant): TenantModel {
    return {
      id: entity.id,
      tenantId: entity.tenantId,
      displayName: entity.displayName,
      status: entity.status,
      isolationLevel: entity.isolationLevel,
      dbConfig: entity.dbConfig,
      vikingAccount: entity.vikingAccount,
      quota: entity.quota,
      ovConfig: entity.ovConfig,
      description: entity.description,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
      deletedAt: entity.deletedAt,
    };
  }
}
