import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DataSource, Repository, type QueryRunner } from 'typeorm';
import { QUEUE_CONFIG } from './constants';
import { SettingsService } from '../settings/settings.service';
import { OVClientService } from '../common/ov-client.service';
import { DynamicDataSourceService } from '../common/dynamic-datasource.service';
import { EncryptionService } from '../common/encryption.service';
import { FeishuIntegrator } from './strategies/feishu.integrator';
import { DingTalkIntegrator } from './strategies/dingtalk.integrator';
import { GitIntegrator } from './strategies/git.integrator';
import { ImportTask } from './entities/import-task.entity';
import type { ImportTaskModel } from './domain/import-task.model';
import type { PlatformInjectConfig } from '../common/external-api.types';
import { Integration } from '../tenant/entities/integration.entity';
import type { IntegrationModel } from '../tenant/domain/integration.model';
import {
  TaskStatus,
  TenantIsolationLevel,
  TenantStatus,
} from '../common/constants/system.enum';
import { Tenant } from '../tenant/entities/tenant.entity';
import type { TenantModel } from '../tenant/domain/tenant.model';

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
    private readonly settings: SettingsService,
    private readonly encryption: EncryptionService,
    private readonly ovClient: OVClientService,
    private readonly feishu: FeishuIntegrator,
    private readonly dingtalk: DingTalkIntegrator,
    private readonly git: GitIntegrator,
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
    const tenant = await this.findTenantForTask(task);

    try {
      await this.withTenantTaskContext(tenant, async (context) => {
        await context.taskRepo.update(task.id, {
          status: TaskStatus.RUNNING,
          updatedAt: new Date(),
        });

        this.logger.log(
          `>> [Task:${task.id.slice(0, 8)}] Processing ${task.sourceType} pipe...`,
        );
        const rawConn = await this.settings.resolveOVConfig(tenant.tenantId);
        const conn = {
          baseUrl: rawConn.baseUrl || '',
          apiKey: rawConn.apiKey || '',
          account: rawConn.account || 'default',
          rerankEndpoint: rawConn.rerankEndpoint || '',
          rerankModel: rawConn.rerankModel || '',
        };

        const injectBody: Record<string, unknown> = {
          path: task.sourceUrl,
          to: task.targetUri,
          reason: `Queue Task: ${task.id}`,
          wait: true,
        };

        if (task.integrationId) {
          const integration = await this.findIntegration(
            context.integrationRepo,
            task.integrationId,
            tenant.tenantId,
          );
          const integrators = [this.feishu, this.dingtalk, this.git];
          const strategy = integrators.find((s) => s.supports(integration.type));

          if (strategy) {
            const resolved: PlatformInjectConfig = await strategy.resolveConfig(
              integration,
              task.sourceUrl,
            );
            injectBody.path = resolved.path;
            injectBody.config = resolved.config;
          }
        }

        await this.ovClient.request(
          conn,
          '/api/v1/resources',
          'POST',
          injectBody,
        );
        await context.taskRepo.update(task.id, {
          status: TaskStatus.DONE,
          updatedAt: new Date(),
        });
      });
      this.logger.log(
        `<< [Task:${task.id.slice(0, 8)}] Successfully ingested.`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : '未知错误';
      this.logger.error(
        `!! [Task:${task.id.slice(0, 8)}] Fatal failure: ${message}`,
      );
      await this.markTaskFailed(tenant, task.id, message);
    } finally {
      this.currentConcurrency--;
    }
  }

  private async findTasksByStatus(status: TaskStatus): Promise<ImportTaskModel[]> {
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
      where: [{ tenantId: task.tenantId }, { id: task.tenantId }],
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
