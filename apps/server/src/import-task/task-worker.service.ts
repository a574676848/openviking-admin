import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { rm } from 'node:fs/promises';
import {
  DataSource,
  In,
  MoreThanOrEqual,
  Repository,
  type QueryRunner,
} from 'typeorm';
import {
  OPENVIKING_RESOURCE_ENDPOINTS,
  OPENVIKING_RESOURCE_INJECT_DEFAULT_WAIT,
  QUEUE_CONFIG,
} from './constants';
import { OVClientService } from '../common/ov-client.service';
import { DynamicDataSourceService } from '../common/dynamic-datasource.service';
import { EncryptionService } from '../common/encryption.service';
import { FeishuIntegrator } from './strategies/feishu.integrator';
import { DingTalkIntegrator } from './strategies/dingtalk.integrator';
import { GitIntegrator } from './strategies/git.integrator';
import { ImportTask } from './entities/import-task.entity';
import { KnowledgeBase } from '../knowledge-base/entities/knowledge-base.entity';
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
import { KnowledgeNode } from '../knowledge-tree/entities/knowledge-node.entity';
import { DocumentDraft } from '../document/entities/document-draft.entity';
import { DocumentSessionRegistry } from '../common/document-session-registry';

interface TenantTaskContext {
  taskRepo: Repository<ImportTask>;
  integrationRepo: Repository<Integration>;
  nodeRepo: Repository<KnowledgeNode>;
  getKbRepo: () => Repository<KnowledgeBase>;
  release: () => Promise<void>;
}

interface TargetKnowledgeNode {
  id: string;
  tenantId: string | null;
  name: string;
  kind: string | null;
  vikingUri: string | null;
  contentUri: string | null;
  draftVersion?: number;
  indexedVersion?: number;
}

const FALLBACK_ERROR_PREVIEW_LIMIT = 240;
const MASKED_URL_CREDENTIAL = '***';
const INITIAL_TASK_TIMESTAMP_TOLERANCE_MS = 1000;
const DELAYED_STATS_SYNC_DELAYS_MS = [10_000, 30_000, 90_000, 180_000, 300_000];
const STATS_SYNC_SCAN_INTERVAL_MS = 5 * 60_000;
const STATS_SYNC_LOOKBACK_MS = 24 * 60 * 60_000;
const STATS_SYNC_SOURCE_TYPES = ['git', 'feishu', 'dingtalk', 'local'] as const;

@Injectable()
export class TaskWorkerService implements OnModuleInit {
  private readonly logger = new Logger(TaskWorkerService.name);
  private currentConcurrency = 0;
  private isPolling = false;
  private isStatsSyncScanning = false;
  private readonly scheduledStatsSyncTaskIds = new Set<string>();
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
    private readonly documentSessionRegistry: DocumentSessionRegistry,
  ) {}

  async onModuleInit() {
    this.logger.log('Initializing TaskWorker: Running cleanup...');
    await this.recoverZombieTasks();
    await this.recoverStatsSyncTasks();
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
      this.runPollSafely();
    }, QUEUE_CONFIG.POLLING_INTERVAL_MS);
    setInterval(() => {
      this.runStatsSyncScanSafely();
    }, STATS_SYNC_SCAN_INTERVAL_MS);
  }

  private runPollSafely() {
    void this.poll().catch((error) => {
      const message = error instanceof Error ? error.message : '未知错误';
      this.logger.error(`Import task polling failed: ${message}`);
    });
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
    let shouldScheduleStatsSync = false;

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
          wait: OPENVIKING_RESOURCE_INJECT_DEFAULT_WAIT,
        };
        const targetNode = await this.findTargetNode(
          context,
          currentTenant.tenantId,
          task.targetUri,
        );
        if (targetNode && this.isDocumentNode(targetNode)) {
          this.documentSessionRegistry.assertNoActiveWriteSession(
            targetNode.id,
          );
          if (this.shouldClearDocumentTargetBeforeImport(targetNode)) {
            await this.prepareDocumentTarget(conn, task.targetUri);
          }
        }

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
            await this.rememberTaskSourceName(
              context,
              task,
              this.resolvePlatformSourceName(resolved),
            );
            if (resolved.tempFile) {
              injectBody.temp_file_id = await this.uploadPlatformTempFile(
                conn,
                resolved.tempFile,
              );
              injectBody.wait =
                resolved.waitForCompletion ??
                OPENVIKING_RESOURCE_INJECT_DEFAULT_WAIT;
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
          injectBody.temp_file_id = await this.uploadLocalTempFile(conn, task);
          delete injectBody.path;
          await this.injectResourceWithPaths(conn, injectBody);
        } else {
          await this.injectResourceWithPaths(conn, injectBody);
        }

        const resourceStats = await this.fetchResourceStats(
          conn,
          this.toEngineResourceUri(task.targetUri),
        );
        const autoCreatedTargetMatch =
          !!targetNode && task.autoCreatedNodeId === targetNode.id;
        const shouldSyncDocumentContentUri =
          autoCreatedTargetMatch ||
          (targetNode ? this.isDocumentNode(targetNode) : false);
        if (shouldSyncDocumentContentUri && targetNode) {
          await this.syncDocumentContentUri(
            context,
            conn,
            targetNode,
            task.targetUri,
            task.sourceName,
            resourceStats.vectorCount,
          );
        }

        await context.taskRepo.update(task.id, {
          status: TaskStatus.DONE,
          ...resourceStats,
          updatedAt: new Date(),
        });
        shouldScheduleStatsSync = this.shouldScheduleStatsSync(
          task,
          injectBody.wait,
          resourceStats,
        );
        await this.cleanupLocalFileAfterDone(task);
      });
      if (shouldScheduleStatsSync) {
        this.scheduleDelayedStatsSync(task);
      }
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

  private runStatsSyncScanSafely() {
    void this.recoverStatsSyncTasks().catch((error) => {
      const message = error instanceof Error ? error.message : '未知错误';
      this.logger.warn(`扫描导入任务延迟统计同步失败: ${message}`);
    });
  }

  private async recoverStatsSyncTasks() {
    if (this.isStatsSyncScanning) {
      return;
    }
    this.isStatsSyncScanning = true;
    try {
      const candidates = await this.findStatsSyncCandidates();
      for (const task of candidates) {
        this.scheduleDelayedStatsSync(task);
      }
    } finally {
      this.isStatsSyncScanning = false;
    }
  }

  private async findStatsSyncCandidates(): Promise<ImportTaskModel[]> {
    const since = new Date(Date.now() - STATS_SYNC_LOOKBACK_MS);
    const tenants = await this.findActiveTenants();
    const tasks: ImportTaskModel[] = [];

    for (const tenant of tenants) {
      await this.withTenantTaskContext(tenant, async (context) => {
        const items = await context.taskRepo.find({
          where: {
            status: TaskStatus.DONE,
            sourceType: In([...STATS_SYNC_SOURCE_TYPES]),
            vectorCount: 0,
            updatedAt: MoreThanOrEqual(since),
          },
          order: { updatedAt: 'DESC' },
          take: 50,
        });
        tasks.push(...items.map((item) => this.toTaskModel(item)));
      }).catch((error) => {
        const message = error instanceof Error ? error.message : '未知错误';
        this.logger.warn(
          `Skip import task stats sync scan for tenant [${tenant.tenantId}]: ${message}`,
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

  private isInitialImportTask(task: ImportTaskModel) {
    const createdAt = task.createdAt?.getTime?.() ?? 0;
    const updatedAt = task.updatedAt?.getTime?.() ?? 0;
    return (
      !task.errorMsg &&
      task.nodeCount === 0 &&
      task.vectorCount === 0 &&
      Math.abs(updatedAt - createdAt) <= INITIAL_TASK_TIMESTAMP_TOLERANCE_MS
    );
  }

  private shouldScheduleStatsSync(
    task: ImportTaskModel,
    wait: unknown,
    stats: Partial<Pick<ImportTaskModel, 'nodeCount' | 'vectorCount'>>,
  ) {
    return (
      wait === false &&
      STATS_SYNC_SOURCE_TYPES.includes(
        task.sourceType as (typeof STATS_SYNC_SOURCE_TYPES)[number],
      ) &&
      (stats.vectorCount ?? 0) === 0
    );
  }

  private scheduleDelayedStatsSync(
    task: Pick<ImportTaskModel, 'id' | 'tenantId'>,
  ) {
    if (this.scheduledStatsSyncTaskIds.has(task.id)) {
      return;
    }
    this.scheduledStatsSyncTaskIds.add(task.id);
    this.scheduleDelayedStatsSyncAttempt(task, 0);
  }

  private scheduleDelayedStatsSyncAttempt(
    task: Pick<ImportTaskModel, 'id' | 'tenantId'>,
    attempt: number,
  ) {
    const delayMs = DELAYED_STATS_SYNC_DELAYS_MS[attempt];
    if (delayMs === undefined) {
      this.scheduledStatsSyncTaskIds.delete(task.id);
      this.logger.warn(
        `导入任务 ${task.id} 延迟统计同步已达到最大重试次数，停止补偿。`,
      );
      return;
    }

    setTimeout(() => {
      void this.syncDelayedTaskStats(task, attempt).catch((error) => {
        const message = error instanceof Error ? error.message : '未知错误';
        this.logger.warn(`导入任务 ${task.id} 延迟统计同步失败: ${message}`);
        this.scheduleDelayedStatsSyncAttempt(task, attempt + 1);
      });
    }, delayMs);
  }

  private async syncDelayedTaskStats(
    taskRef: Pick<ImportTaskModel, 'id' | 'tenantId'>,
    attempt: number,
  ) {
    const tenant = await this.findTenantForTask(taskRef as ImportTaskModel);
    const shouldContinue = await this.withTenantTaskContext(
      tenant,
      async (context) => {
        const task = await context.taskRepo.findOne({
          where: { id: taskRef.id, tenantId: taskRef.tenantId },
        });
        if (!task || !this.shouldSyncStatsCandidate(this.toTaskModel(task))) {
          this.scheduledStatsSyncTaskIds.delete(taskRef.id);
          return false;
        }

        const rawConn = await this.ovConfigResolver.resolve(tenant.tenantId);
        const conn = {
          baseUrl: rawConn.baseUrl || '',
          apiKey: rawConn.apiKey || '',
          account: rawConn.account || 'default',
          user: rawConn.user || '',
        };
        const taskStats = await this.fetchResourceStats(
          conn,
          this.toEngineResourceUri(task.targetUri),
        );
        await context.taskRepo.update(task.id, {
          ...taskStats,
          updatedAt: new Date(),
        });
        await this.refreshKnowledgeBaseStats(
          context,
          conn,
          this.toTaskModel(task),
        );
        if ((taskStats.vectorCount ?? 0) > 0) {
          this.scheduledStatsSyncTaskIds.delete(taskRef.id);
          return false;
        }
        return true;
      },
    );

    if (shouldContinue) {
      this.scheduleDelayedStatsSyncAttempt(taskRef, attempt + 1);
    }
  }

  private shouldSyncStatsCandidate(task: ImportTaskModel) {
    return (
      task.status === TaskStatus.DONE &&
      STATS_SYNC_SOURCE_TYPES.includes(
        task.sourceType as (typeof STATS_SYNC_SOURCE_TYPES)[number],
      ) &&
      task.vectorCount === 0
    );
  }

  private resolvePlatformSourceName(resolved: PlatformInjectConfig) {
    return resolved.tempFile?.fileName ?? null;
  }

  private async rememberTaskSourceName(
    context: TenantTaskContext,
    task: ImportTaskModel,
    sourceName: string | null,
  ) {
    if (task.sourceName || !sourceName) {
      return;
    }

    task.sourceName = sourceName;
    await context.taskRepo.update(task.id, {
      sourceName,
      updatedAt: new Date(),
    });
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

  private async refreshKnowledgeBaseStats(
    context: TenantTaskContext,
    conn: {
      baseUrl: string;
      apiKey: string;
      account: string;
      user: string;
    },
    task: ImportTaskModel,
  ) {
    const kbRepo = context.getKbRepo();
    const kb = await kbRepo.findOne({
      where: { id: task.kbId, tenantId: task.tenantId },
    });
    if (!kb?.vikingUri) {
      return;
    }
    const stats = await this.fetchResourceStats(
      conn,
      this.toEngineResourceUri(kb.vikingUri),
    );
    await kbRepo.update(kb.id, {
      docCount: stats.nodeCount,
      vectorCount: stats.vectorCount,
      updatedAt: new Date(),
    });
  }

  private async findTargetNode(
    context: TenantTaskContext,
    tenantId: string,
    targetUri: string,
  ): Promise<TargetKnowledgeNode | null> {
    if (
      typeof (context.nodeRepo as { findOne?: unknown }).findOne !== 'function'
    ) {
      return null;
    }
    const candidates = this.resolveTargetUriCandidates(targetUri);
    const node = await context.nodeRepo.findOne({
      where: candidates.map((candidate) => ({
        tenantId,
        vikingUri: candidate,
      })),
    });
    return node ?? null;
  }

  private isDocumentNode(
    node: TargetKnowledgeNode | null,
  ): node is TargetKnowledgeNode {
    if (!node) {
      return false;
    }

    if (node.kind === 'document') {
      return true;
    }

    return Boolean(node.vikingUri && !node.vikingUri.endsWith('/'));
  }

  private shouldClearDocumentTargetBeforeImport(
    node: TargetKnowledgeNode,
  ): boolean {
    return Boolean(node.contentUri);
  }

  private resolveTargetUriCandidates(targetUri: string) {
    const normalized = this.toEngineResourceUri(targetUri);
    const candidates = [normalized];
    const tenantPrefix = 'viking://resources/tenants/';
    const legacyPrefix = 'viking://resources/';

    if (normalized.startsWith(tenantPrefix)) {
      candidates.push(
        `${legacyPrefix}${normalized.slice(tenantPrefix.length)}`,
      );
    } else if (normalized.startsWith(legacyPrefix)) {
      candidates.push(
        `${tenantPrefix}${normalized.slice(legacyPrefix.length)}`,
      );
    }

    return Array.from(new Set(candidates));
  }

  private async prepareDocumentTarget(
    conn: {
      baseUrl: string;
      apiKey: string;
      account: string;
      user: string;
    },
    targetUri: string,
  ) {
    try {
      await this.ovClient.request(
        conn,
        `/api/v1/fs?uri=${encodeURIComponent(
          this.toEngineResourceUri(targetUri),
        )}&recursive=true`,
        'DELETE',
        undefined,
        { user: conn.user || undefined },
        { serviceLabel: 'OpenViking 资源删除' },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      if (message.includes('404') || message.includes('NOT_FOUND')) {
        return;
      }
      throw error;
    }
  }

  private async syncDocumentContentUri(
    context: TenantTaskContext,
    conn: {
      baseUrl: string;
      apiKey: string;
      account: string;
      user: string;
    },
    node: TargetKnowledgeNode,
    targetUri: string,
    sourceName?: string | null,
    vectorCount?: number | null,
  ) {
    const treeData = await this.ovClient.request(
      conn,
      `/api/v1/fs/tree?uri=${encodeURIComponent(
        this.toEngineResourceUri(targetUri),
      )}&depth=1`,
      'GET',
      undefined,
      { user: conn.user || undefined },
      { serviceLabel: 'OpenViking 资源树' },
    );
    const resources = Array.isArray(treeData?.result) ? treeData.result : [];
    const leafResources = resources.filter(
      (item): item is { uri: string; isDir?: boolean } =>
        Boolean(
          item &&
          typeof item === 'object' &&
          typeof (item as { uri?: unknown }).uri === 'string' &&
          (item as { isDir?: unknown }).isDir === false,
        ),
    );
    if (leafResources.length === 0) {
      this.logger.warn(`文档叶子 ${node.id} 的内容资源数量为 0。`);
      return;
    }

    const contentResource = this.resolveDocumentContentResource(
      leafResources,
      sourceName,
    );
    if (!contentResource) {
      this.logger.warn(
        `文档叶子 ${node.id} 的内容资源数量异常，期望能按来源文件名唯一匹配，实际 ${leafResources.length} 个。可能处于协作保存并发状态或存在孤儿文件，跳过 contentUri 覆盖。`,
      );
      return;
    }

    const indexedVersion = node.draftVersion ?? node.indexedVersion ?? 0;
    await context.nodeRepo.update(node.id, {
      contentUri: contentResource.uri,
      indexStatus: 'clean',
      indexedVersion,
      ...(vectorCount !== undefined ? { vectorCount } : {}),
      lastIndexedAt: new Date(),
      indexError: null,
      updatedAt: new Date(),
    });

    // 草稿预热：异步下载内容到 draft，不阻塞主流程
    this.warmDraftAfterImport(context, conn, node, contentResource.uri).catch(
      (err) =>
        this.logger.warn(
          `草稿预热失败 [nodeId=${node.id}]: ${err instanceof Error ? err.message : String(err)}`,
        ),
    );
  }

  private async warmDraftAfterImport(
    context: TenantTaskContext,
    conn: { baseUrl: string; apiKey: string; account: string; user: string },
    node: TargetKnowledgeNode,
    contentUri: string,
  ): Promise<void> {
    const downloadPath = `/api/v1/fs/download?uri=${encodeURIComponent(contentUri)}`;
    const response = await this.ovClient.requestStream(
      conn,
      downloadPath,
      'GET',
      undefined,
      { user: conn.user || undefined },
      { serviceLabel: '草稿预热下载' },
    );
    const chunks: Buffer[] = [];
    for await (const chunk of response.stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const markdown = Buffer.concat(chunks).toString('utf-8');
    if (!markdown || markdown.trim().length === 0) return;

    const draftRepo = context.nodeRepo.manager.getRepository(DocumentDraft);
    const existing = await draftRepo.findOne({
      where: { nodeId: node.id, tenantId: node.tenantId ?? undefined },
    });
    const nextVersion = (existing?.version ?? 0) + 1;
    const draft = draftRepo.create({
      ...existing,
      tenantId: node.tenantId,
      nodeId: node.id,
      markdown,
      version: nextVersion,
    });
    await draftRepo.save(draft);
    await context.nodeRepo.update(node.id, { draftVersion: nextVersion });
  }

  private resolveDocumentContentResource(
    leafResources: Array<{ uri: string; isDir?: boolean }>,
    sourceName?: string | null,
  ) {
    if (leafResources.length === 1) {
      return leafResources[0];
    }

    const normalizedSourceName = this.normalizeResourceFileName(sourceName);
    if (!normalizedSourceName) {
      return null;
    }

    const matchedResources = leafResources.filter(
      (resource) =>
        this.normalizeResourceFileName(
          this.extractResourceFileName(resource.uri),
        ) === normalizedSourceName,
    );
    return matchedResources.length === 1 ? matchedResources[0] : null;
  }

  private extractResourceFileName(uri: string) {
    const normalizedUri = uri.endsWith('/') ? uri.slice(0, -1) : uri;
    const fileName = normalizedUri.slice(normalizedUri.lastIndexOf('/') + 1);
    try {
      return decodeURIComponent(fileName);
    } catch {
      return fileName;
    }
  }

  private normalizeResourceFileName(value?: string | null) {
    return (
      value
        ?.trim()
        .toLowerCase()
        .replace(/[\s_]+/g, '') || null
    );
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
    const firstPath =
      typeof injectBody.path === 'string' ? injectBody.path : null;
    const paths = firstPath ? [firstPath, ...fallbackPaths] : [null];
    let lastError: unknown = null;
    const fallbackErrors: string[] = [];

    for (const path of paths) {
      const body = { ...injectBody };
      if (path) {
        body.path = path;
      }
      const result = await this.ovClient
        .request(conn, OPENVIKING_RESOURCE_ENDPOINTS.INJECT, 'POST', body, {
          user: conn.user || undefined,
        })
        .catch((error) => {
          lastError = error;
          fallbackErrors.push(this.formatFallbackError(path, error));
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
        fallbackErrors.push(this.formatFallbackError(path, error));
      }
    }

    if (fallbackErrors.length > 1) {
      throw new Error(
        `OpenViking 资源注入失败，已尝试 ${fallbackErrors.length} 个来源：${fallbackErrors.join('；')}`,
      );
    }

    throw lastError instanceof Error
      ? lastError
      : new Error('OpenViking 资源注入失败');
  }

  private formatFallbackError(path: string | null, error: unknown) {
    const source = path ? this.maskSensitiveUrl(path) : 'temp_file_id';
    const message = this.toFallbackErrorMessage(error);
    return `${source} -> ${message}`;
  }

  private toFallbackErrorMessage(error: unknown) {
    const rawMessage =
      error instanceof Error ? error.message : String(error ?? '未知错误');
    return this.maskSensitiveText(rawMessage).slice(
      0,
      FALLBACK_ERROR_PREVIEW_LIMIT,
    );
  }

  private maskSensitiveUrl(value: string) {
    try {
      const url = new URL(value);
      if (url.username || url.password) {
        url.username = MASKED_URL_CREDENTIAL;
        url.password = '';
      }
      return url.toString();
    } catch {
      return this.maskSensitiveText(value);
    }
  }

  private maskSensitiveText(value: string) {
    return value.replace(
      /(https?:\/\/)([^@\s/]+)@/g,
      `$1${MASKED_URL_CREDENTIAL}@`,
    );
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
        fileName: task.sourceName || file.fileName,
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
      buffer?: Buffer;
      filePath?: string;
      cleanupAfterUpload?: boolean;
      mimeType: string | null;
    },
  ) {
    try {
      const response = await this.ovClient.uploadTempFile(
        conn,
        OPENVIKING_RESOURCE_ENDPOINTS.TEMP_UPLOAD,
        file,
        { user: conn.user || undefined },
        { serviceLabel: 'OpenViking Resources' },
      );
      return this.extractTempFileId(response);
    } finally {
      if (file.cleanupAfterUpload && file.filePath) {
        await rm(file.filePath, { force: true });
      }
    }
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

  private resolveNodeCountFromStat(
    statResult: Record<string, unknown> | undefined,
  ) {
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
        nodeRepo: dataSource.getRepository(KnowledgeNode),
        getKbRepo: () => dataSource.getRepository(KnowledgeBase),
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
      nodeRepo: this.defaultDataSource.getRepository(KnowledgeNode),
      getKbRepo: () => this.defaultDataSource.getRepository(KnowledgeBase),
      release: async () => undefined,
    };
  }

  private createQueryRunnerContext(
    queryRunner: QueryRunner,
  ): TenantTaskContext {
    return {
      taskRepo: queryRunner.manager.getRepository(ImportTask),
      integrationRepo: queryRunner.manager.getRepository(Integration),
      nodeRepo: queryRunner.manager.getRepository(KnowledgeNode),
      getKbRepo: () => queryRunner.manager.getRepository(KnowledgeBase),
      release: async () => {
        if (queryRunner.isReleased) {
          return;
        }

        try {
          await queryRunner.query('SET search_path TO public');
        } finally {
          if (!queryRunner.isReleased) {
            await queryRunner.release();
          }
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
    const message =
      Array.isArray(errors) && errors.length > 0
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
      sourceName: entity.sourceName ?? null,
      targetUri: entity.targetUri,
      autoCreatedNodeId: entity.autoCreatedNodeId ?? null,
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
