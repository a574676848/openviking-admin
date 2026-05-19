import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Inject,
  Logger,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { DataSource, type QueryRunner } from 'typeorm';
import type { ImportTaskModel } from './domain/import-task.model';
import { CreateImportTaskDto } from './dto/create-import-task.dto';
import { SettingsService } from '../settings/settings.service';
import { OVClientService } from '../common/ov-client.service';
import { IMPORT_TASK_REPOSITORY } from './domain/repositories/import-task.repository.interface';
import type { IImportTaskRepository } from './domain/repositories/import-task.repository.interface';
import { CreateLocalImportTaskDto } from './dto/create-local-import-task.dto';
import {
  LocalImportStorageService,
  type LocalImportUploadFile,
} from './local-import-storage.service';
import { IMPORT_TASK_FIELD_LIMITS } from './constants';
import { TaskStatus } from '../common/constants/system.enum';
import { KNOWLEDGE_BASE_REPOSITORY } from '../knowledge-base/domain/repositories/knowledge-base.repository.interface';
import type { IKnowledgeBaseRepository } from '../knowledge-base/domain/repositories/knowledge-base.repository.interface';
import { IKnowledgeNodeRepository } from '../knowledge-tree/domain/repositories/knowledge-node.repository.interface';
import type { KnowledgeNodeModel } from '../knowledge-tree/domain/knowledge-node.model';
import type { IKnowledgeNodeRepository as IKnowledgeNodeRepositoryType } from '../knowledge-tree/domain/repositories/knowledge-node.repository.interface';
import { KnowledgeTreeService } from '../knowledge-tree/knowledge-tree.service';
import {
  applyCreatedAuditActor,
  applyUpdatedAuditActor,
  type AuditActorSnapshot,
} from '../common/audit-actor.types';
import type { RepositoryRequest } from '../common/repository-request.interface';

const AUTO_TARGET_SEGMENTS: Record<string, string> = {
  git: 'imports/git',
  url: 'imports/url',
  feishu: 'imports/feishu',
  dingtalk: 'imports/dingtalk',
  local: 'imports/local',
  manifest: 'imports/manifest',
};
const RESOURCE_URI_PREFIX = 'viking://resources/';
const TENANT_RESOURCE_PREFIX = 'viking://resources/tenants/';
const GIT_REPOSITORY_SUFFIX = '.git';
const AUTO_DOCUMENT_SOURCE_TYPES = ['local', 'url', 'feishu', 'dingtalk'];
const TARGET_RESOURCE_DELETE_SOURCE_TYPES = ['git'];
const DEFAULT_IMPORT_DOCUMENT_EXTENSION = '.md';
const DOCUMENT_NAME_EXTENSION_PATTERN = /\.[^./\\]+$/;
const ACTIVE_OV_RESOURCE_NODE_THRESHOLD = 0;
const COMPLETED_OV_RESOURCE_VECTOR_THRESHOLD = 0;
const GIT_TASK_TARGET_SEGMENT_SUFFIX_LENGTH = 8;

@Injectable()
export class ImportTaskService {
  private readonly logger = new Logger(ImportTaskService.name);

  constructor(
    @Inject(IMPORT_TASK_REPOSITORY)
    private readonly taskRepo: IImportTaskRepository,
    @Inject(KNOWLEDGE_BASE_REPOSITORY)
    private readonly kbRepo: IKnowledgeBaseRepository,
    @Inject(IKnowledgeNodeRepository)
    private readonly nodeRepo: IKnowledgeNodeRepositoryType,
    private readonly settings: SettingsService,
    private readonly ovClient: OVClientService,
    private readonly localImportStorage: LocalImportStorageService,
    private readonly knowledgeTreeService: KnowledgeTreeService,
    private readonly defaultDataSource: DataSource,
    @Inject(REQUEST) private readonly request: RepositoryRequest,
  ) {}

  findAll(tenantId: string | null) {
    return this.taskRepo.findAll(tenantId);
  }

  async findOne(id: string, tenantId: string | null) {
    const task = await this.taskRepo.findById(id, tenantId);
    if (!task) throw new NotFoundException(`导入任务 ${id} 不存在`);
    return task;
  }

  async create(
    dto: CreateImportTaskDto,
    tenantId: string,
    actor?: AuditActorSnapshot | null,
  ) {
    if (
      ['git', 'feishu', 'dingtalk'].includes(dto.sourceType) &&
      !dto.integrationId
    ) {
      throw new BadRequestException('该来源类型必须选择集成凭证');
    }

    const sourceUrls = this.resolveSourceUrls(dto);
    if (sourceUrls.length === 0) {
      throw new BadRequestException('请至少提供一个来源地址');
    }
    this.assertLocalSources(dto.sourceType, sourceUrls);
    return this.runInTenantTransaction(async () => {
      const baseTargetUri = await this.resolveTargetUri(dto, tenantId);
      const {
        sourceName: _sourceName,
        sourceNames: _sourceNames,
        ...taskDto
      } = dto;

      const dispatch = await Promise.all(
        sourceUrls.map(async (sourceUrl, index) => {
          const sourceName = this.resolveSourceName(dto, sourceUrl, index);
          const autoNode = await this.createAutoDocumentNode(
            dto,
            sourceName,
            sourceUrl,
            baseTargetUri,
            tenantId,
            actor,
          );
          return this.taskRepo.create(
            applyCreatedAuditActor(
              {
                ...taskDto,
                sourceUrl,
                sourceName,
                targetUri:
                  autoNode?.vikingUri ??
                  this.resolveTaskTargetUri(
                    dto,
                    baseTargetUri,
                    sourceName ?? sourceUrl,
                  ),
                autoCreatedNodeId: autoNode?.id ?? null,
                tenantId,
                status: TaskStatus.PENDING,
              } as Partial<ImportTaskModel>,
              actor,
            ),
          );
        }),
      );
      const saved = await this.taskRepo.save(
        dispatch.length === 1 ? dispatch[0] : dispatch,
      );
      return Array.isArray(saved) ? saved[0] : saved;
    });
  }

  async createLocalUpload(
    dto: CreateLocalImportTaskDto,
    files: LocalImportUploadFile[],
    tenantId: string,
    actor?: AuditActorSnapshot | null,
  ) {
    if (files.length === 0) {
      throw new BadRequestException('请先上传文件');
    }

    const storedFiles = await this.localImportStorage.saveFiles(
      tenantId,
      dto.kbId,
      files,
    );

    try {
      return await this.create(
        {
          kbId: dto.kbId,
          sourceType: 'local',
          sourceUrls: storedFiles.map((file) => file.sourceUrl),
          sourceNames: storedFiles.map((file) => file.originalName),
          targetUri: dto.targetUri,
        },
        tenantId,
        actor,
      );
    } catch (error) {
      await Promise.all(
        storedFiles.map((file) =>
          this.localImportStorage.deleteBySourceUrl(file.sourceUrl),
        ),
      );
      throw error;
    }
  }

  private async resolveTargetUri(dto: CreateImportTaskDto, tenantId: string) {
    const kb = await this.kbRepo.findById(dto.kbId, tenantId);
    if (!kb) {
      throw new NotFoundException(`知识库 ${dto.kbId} 不存在或无权访问`);
    }

    const knowledgeBaseUri = this.toEngineResourceUri(
      this.normalizeTargetUri(kb.vikingUri),
    );

    if (dto.targetUri?.trim()) {
      return this.validateExplicitTargetUri(
        this.resolveExplicitTargetUriCandidates(dto.targetUri),
        knowledgeBaseUri,
        await this.findNodeUris(dto.kbId, tenantId),
      );
    }

    const segment = AUTO_TARGET_SEGMENTS[dto.sourceType] ?? 'imports/misc';
    return `${knowledgeBaseUri}${segment}/`;
  }

  private normalizeTargetUri(uri: string) {
    const trimmed = uri.trim();
    return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
  }

  private resolveExplicitTargetUriCandidates(uri: string) {
    const trimmed = uri.trim();
    const candidates = [trimmed];
    if (!trimmed.endsWith('/')) {
      candidates.push(`${trimmed}/`);
    }
    return candidates.map((candidate) => this.toEngineResourceUri(candidate));
  }

  private async findNodeUris(kbId: string, tenantId: string) {
    const nodes = await this.nodeRepo.find({
      where: { kbId, tenantId },
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });
    return nodes
      .map((node: KnowledgeNodeModel) => node.vikingUri)
      .filter((uri): uri is string => Boolean(uri))
      .map((uri) => this.toEngineResourceUri(uri.trim()));
  }

  private toEngineResourceUri(uri: string) {
    if (uri.startsWith(TENANT_RESOURCE_PREFIX)) {
      return uri;
    }
    if (!uri.startsWith(RESOURCE_URI_PREFIX)) {
      return uri;
    }

    return `${TENANT_RESOURCE_PREFIX}${uri.slice(RESOURCE_URI_PREFIX.length)}`;
  }

  private resolveTaskTargetUri(
    dto: CreateImportTaskDto,
    baseTargetUri: string,
    sourceUrl: string,
  ) {
    if (dto.sourceType !== 'git') {
      return baseTargetUri;
    }
    const normalizedBaseTargetUri = this.normalizeTargetUri(baseTargetUri);
    return `${normalizedBaseTargetUri}${this.createGitTaskTargetSegment(
      sourceUrl,
    )}/`;
  }

  private createGitTaskTargetSegment(sourceSeed: string) {
    const normalized = sourceSeed
      .trim()
      .replace(GIT_REPOSITORY_SUFFIX, '')
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/-{2,}/g, '-')
      .replace(/^[-_.]+|[-_.]+$/g, '');
    const baseSegment = normalized.length > 0 ? normalized : 'git';
    const uniqueSuffix = randomUUID().replace(/-/g, '').slice(
      0,
      GIT_TASK_TARGET_SEGMENT_SUFFIX_LENGTH,
    );
    return `${baseSegment}-${uniqueSuffix}`;
  }

  private validateExplicitTargetUri(
    targetUris: string[],
    knowledgeBaseUri: string,
    nodeUris: string[],
  ) {
    const targetUri = targetUris.find(
      (candidate) =>
        candidate === knowledgeBaseUri || nodeUris.includes(candidate),
    );
    if (targetUri) {
      return targetUri;
    }

    throw new BadRequestException(
      '非法导入目标路径：只能导入到当前知识库根目录或当前知识库已有节点下。',
    );
  }

  private resolveSourceUrls(dto: CreateImportTaskDto) {
    const sourceUrls = dto.sourceUrls
      ?.map((item) => item.trim())
      .filter((item) => item.length > 0);
    if (sourceUrls?.length) {
      return sourceUrls;
    }
    if (dto.sourceUrl?.trim()) {
      return [dto.sourceUrl.trim()];
    }
    return [];
  }

  private resolveSourceName(
    dto: CreateImportTaskDto,
    sourceUrl: string,
    index: number,
  ) {
    const explicitName = this.resolveExplicitSourceName(dto, index);
    if (explicitName) {
      return this.truncateSourceName(explicitName);
    }

    if (dto.sourceType === 'git') {
      return this.resolveGitRepositoryName(sourceUrl);
    }

    if (this.shouldInferSourceNameFromUrl(dto.sourceType)) {
      return this.resolvePathSourceName(sourceUrl);
    }

    return null;
  }

  private resolveExplicitSourceName(dto: CreateImportTaskDto, index: number) {
    const indexedName = dto.sourceNames?.[index]?.trim();
    if (indexedName) {
      return indexedName;
    }

    if (index === 0) {
      return dto.sourceName?.trim() || null;
    }

    return null;
  }

  private shouldInferSourceNameFromUrl(sourceType: string) {
    return ['local', 'url', 'manifest'].includes(sourceType);
  }

  private shouldAutoCreateDocumentNode(sourceType: string) {
    return AUTO_DOCUMENT_SOURCE_TYPES.includes(sourceType);
  }

  private async createAutoDocumentNode(
    dto: CreateImportTaskDto,
    sourceName: string | null,
    sourceUrl: string,
    baseTargetUri: string,
    tenantId: string,
    actor?: AuditActorSnapshot | null,
  ): Promise<KnowledgeNodeModel | null> {
    if (!this.shouldAutoCreateDocumentNode(dto.sourceType)) {
      return null;
    }

    const parentNode = await this.findTargetCollectionNode(
      dto.kbId,
      tenantId,
      baseTargetUri,
    );
    return this.nodeRepo.createFileWithGeneratedUri(
      applyCreatedAuditActor(
        {
          tenantId,
          kbId: dto.kbId,
          parentId: parentNode?.id ?? null,
          name: this.resolveAutoDocumentNodeName(sourceName, sourceUrl),
          sortOrder: 0,
          kind: 'document',
          indexStatus: 'pending',
          fileExtension: DEFAULT_IMPORT_DOCUMENT_EXTENSION,
        },
        actor,
      ),
    );
  }

  private async findTargetCollectionNode(
    kbId: string,
    tenantId: string,
    targetUri: string,
  ) {
    const node = await this.nodeRepo.findOne({
      where: {
        kbId,
        tenantId,
        vikingUri: targetUri,
      },
    });
    return node?.kind === 'collection' ? node : null;
  }

  private resolveAutoDocumentNodeName(
    sourceName: string | null,
    sourceUrl: string,
  ) {
    const name = sourceName?.trim() || this.resolvePathSourceName(sourceUrl);
    const displayName = name || '导入文档';
    const documentName = DOCUMENT_NAME_EXTENSION_PATTERN.test(displayName)
      ? displayName
      : `${displayName}${DEFAULT_IMPORT_DOCUMENT_EXTENSION}`;
    return this.truncateSourceName(documentName);
  }

  private resolveGitRepositoryName(sourceUrl: string) {
    const sourcePath = this.resolveSourcePath(sourceUrl);
    const repositoryName = sourcePath
      .split(/[\\/]/)
      .filter(Boolean)
      .at(-1)
      ?.trim();
    if (!repositoryName) {
      return null;
    }

    const decodedName = this.decodePathSegment(repositoryName);
    const displayName = decodedName
      .toLowerCase()
      .endsWith(GIT_REPOSITORY_SUFFIX)
      ? decodedName.slice(0, -GIT_REPOSITORY_SUFFIX.length)
      : decodedName;
    return this.truncateSourceName(displayName);
  }

  private resolvePathSourceName(sourceUrl: string) {
    const sourcePath = this.resolveSourcePath(sourceUrl);
    const fileName = sourcePath.split(/[\\/]/).filter(Boolean).at(-1)?.trim();
    if (!fileName) {
      return null;
    }

    return this.truncateSourceName(this.decodePathSegment(fileName));
  }

  private resolveSourcePath(sourceUrl: string) {
    const trimmed = sourceUrl
      .trim()
      .replace(/[?#].*$/, '')
      .replace(/\/+$/, '');
    try {
      return new URL(trimmed).pathname;
    } catch {
      return trimmed;
    }
  }

  private decodePathSegment(segment: string) {
    try {
      return decodeURIComponent(segment);
    } catch {
      return segment;
    }
  }

  private truncateSourceName(value: string) {
    return value.slice(0, IMPORT_TASK_FIELD_LIMITS.SOURCE_NAME_MAX_LENGTH);
  }

  private assertLocalSources(sourceType: string, sourceUrls: string[]) {
    if (sourceType !== 'local') {
      return;
    }

    const hasUnmanagedSource = sourceUrls.some(
      (sourceUrl) => !this.localImportStorage.isManagedFileUrl(sourceUrl),
    );
    if (hasUnmanagedSource) {
      throw new BadRequestException('本地导入只能使用受控上传文件');
    }
  }

  async syncResult(id: string, tenantId: string | null) {
    const task = await this.findOne(id, tenantId);
    if (!task) return null;

    try {
      const conn = await this.resolveOpenVikingConnection(task.tenantId);
      const stats = await this.fetchResourceStats(
        conn,
        this.toEngineResourceUri(task.targetUri),
      );
      await this.taskRepo.update(id, stats);
      await this.refreshKnowledgeBaseStatsFromOpenViking(task, conn);
      return this.taskRepo.findById(id, tenantId);
    } catch (err) {
      const message = err instanceof Error ? err.message : '未知错误';
      this.logger.warn(`Sync result for task ${id} failed: ${message}`);
    }
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

  private async refreshKnowledgeBaseStatsFromOpenViking(
    task: ImportTaskModel,
    conn: {
      baseUrl: string;
      apiKey: string;
      account: string;
      user: string;
    },
  ) {
    const kb = await this.kbRepo.findById(task.kbId, task.tenantId);
    if (!kb?.vikingUri) {
      return;
    }

    const stats = await this.fetchResourceStats(
      conn,
      this.toEngineResourceUri(kb.vikingUri),
    );
    await this.kbRepo.save({
      ...kb,
      docCount: stats.nodeCount,
      vectorCount: stats.vectorCount,
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
    const statData = await this.ovClient.request(
      conn,
      `/api/v1/fs/stat?uri=${encodeURIComponent(targetUri)}`,
      'GET',
      undefined,
      { user: conn.user || undefined },
    );
    const statResult = statData?.result as Record<string, unknown> | undefined;
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

    return {
      nodeCount,
      vectorCount: this.toNonNegativeNumber(vecResult?.count),
    };
  }

  async retry(
    id: string,
    tenantId: string | null,
    actor?: AuditActorSnapshot | null,
  ) {
    const task = await this.findOne(id, tenantId);
    if (
      ![TaskStatus.FAILED, TaskStatus.CANCELLED].includes(
        task.status as TaskStatus,
      )
    ) {
      throw new ConflictException('只有失败或已取消的任务才能重试');
    }

    const syncedTask = await this.syncTaskFromOpenVikingBeforeRetry(
      task,
      actor,
    );
    if (syncedTask) {
      return syncedTask;
    }

    if (task.status === TaskStatus.FAILED) {
      await this.clearRetryTargetResources(task);
    }

    await this.taskRepo.update(
      id,
      applyUpdatedAuditActor(
        {
          status: TaskStatus.PENDING,
          errorMsg: null,
          nodeCount: 0,
          vectorCount: 0,
          updatedAt: new Date(),
        },
        actor,
      ),
    );
    return this.taskRepo.findById(id, tenantId);
  }

  private async syncTaskFromOpenVikingBeforeRetry(
    task: ImportTaskModel,
    actor?: AuditActorSnapshot | null,
  ) {
    try {
      const conn = await this.resolveOpenVikingConnection(task.tenantId);
      const stats = await this.fetchResourceStats(
        conn,
        this.toEngineResourceUri(task.targetUri),
      );
      const status = this.resolveRetrySyncStatus(stats);
      if (!status) {
        return null;
      }

      await this.taskRepo.update(
        task.id,
        applyUpdatedAuditActor(
          {
            status,
            errorMsg: null,
            nodeCount: stats.nodeCount,
            vectorCount: stats.vectorCount,
            updatedAt: new Date(),
          },
          actor,
        ),
      );
      await this.refreshKnowledgeBaseStatsFromOpenViking(task, conn);
      return this.taskRepo.findById(task.id, task.tenantId);
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      this.logger.warn(
        `Retry pre-sync for task ${task.id} failed: ${message}`,
      );
      return null;
    }
  }

  private resolveRetrySyncStatus(
    stats: Pick<ImportTaskModel, 'nodeCount' | 'vectorCount'>,
  ) {
    if ((stats.vectorCount ?? 0) > COMPLETED_OV_RESOURCE_VECTOR_THRESHOLD) {
      return TaskStatus.DONE;
    }
    if ((stats.nodeCount ?? 0) > ACTIVE_OV_RESOURCE_NODE_THRESHOLD) {
      return TaskStatus.RUNNING;
    }
    return null;
  }

  async cancel(
    id: string,
    tenantId: string | null,
    actor?: AuditActorSnapshot | null,
  ) {
    const task = await this.findOne(id, tenantId);
    if (task.status === TaskStatus.RUNNING) {
      throw new ConflictException('任务已进入执行阶段，当前版本不支持中途停止');
    }
    if (task.status !== TaskStatus.PENDING) {
      throw new ConflictException('只有排队中的任务才能取消');
    }

    await this.taskRepo.update(
      id,
      applyUpdatedAuditActor(
        {
          status: TaskStatus.CANCELLED,
          errorMsg: '用户已取消排队任务',
          updatedAt: new Date(),
        },
        actor,
      ),
    );
    if (task.sourceType === 'local') {
      await this.localImportStorage.deleteBySourceUrl(task.sourceUrl);
    }
    return this.taskRepo.findById(id, tenantId);
  }

  async deleteFailed(id: string, tenantId: string | null) {
    const task = await this.findOne(id, tenantId);
    if (![TaskStatus.FAILED, TaskStatus.DONE].includes(task.status)) {
      throw new ConflictException('只有失败或成功任务才能物理删除');
    }

    if (task.sourceType === 'local') {
      await this.localImportStorage.deleteBySourceUrl(task.sourceUrl);
    }
    await this.runInTenantTransaction(async () => {
      await this.deleteAutoCreatedNode(task);
      await this.deleteTaskTargetResources(task);
      await this.refreshKnowledgeBaseStatsAfterTaskDelete(task);
      await this.taskRepo.delete(id, tenantId);
    });
    return task;
  }

  private async refreshKnowledgeBaseStatsAfterTaskDelete(
    task: ImportTaskModel,
  ) {
    try {
      const conn = await this.resolveOpenVikingConnection(task.tenantId);
      await this.refreshKnowledgeBaseStatsFromOpenViking(task, conn);
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      this.logger.warn(`删除任务后刷新知识库统计失败: ${message}`);
    }
  }

  private async deleteAutoCreatedNode(task: ImportTaskModel): Promise<void> {
    if (!task.autoCreatedNodeId) {
      return;
    }

    const node = await this.nodeRepo.findOne({
      where: {
        id: task.autoCreatedNodeId,
        tenantId: task.tenantId,
        kbId: task.kbId,
      },
    });
    if (!node) {
      return;
    }

    await this.knowledgeTreeService.remove(node.id, task.tenantId);
  }

  private async deleteTaskTargetResources(
    task: ImportTaskModel,
  ): Promise<void> {
    if (
      task.autoCreatedNodeId ||
      !TARGET_RESOURCE_DELETE_SOURCE_TYPES.includes(task.sourceType)
    ) {
      return;
    }

    await this.clearTaskTargetResources(task, 'OpenViking 任务资源删除');
  }

  private async runInTenantTransaction<T>(operation: () => Promise<T>) {
    const existingQueryRunner = this.request?.tenantQueryRunner;
    if (existingQueryRunner) {
      return this.runWithQueryRunnerTransaction(
        existingQueryRunner,
        operation,
      );
    }

    const queryRunner = (
      this.request?.tenantDataSource ?? this.defaultDataSource
    ).createQueryRunner();
    await queryRunner.connect();

    const previousQueryRunner = this.request?.tenantQueryRunner;
    if (this.request) {
      this.request.tenantQueryRunner = queryRunner;
    }

    try {
      return await this.runWithQueryRunnerTransaction(queryRunner, operation);
    } finally {
      if (this.request) {
        this.request.tenantQueryRunner = previousQueryRunner;
      }
      if (!queryRunner.isReleased) {
        await queryRunner.release();
      }
    }
  }

  private async runWithQueryRunnerTransaction<T>(
    queryRunner: QueryRunner,
    operation: () => Promise<T>,
  ) {
    const shouldManageTransaction = !queryRunner.isTransactionActive;
    if (shouldManageTransaction) {
      await queryRunner.startTransaction();
    }

    try {
      const result = await operation();
      if (shouldManageTransaction) {
        await queryRunner.commitTransaction();
      }
      return result;
    } catch (error) {
      if (shouldManageTransaction && !queryRunner.isReleased) {
        await queryRunner.rollbackTransaction();
      }
      throw error;
    }
  }

  private async clearRetryTargetResources(task: ImportTaskModel) {
    await this.clearTaskTargetResources(task, 'OpenViking 重试资源清理');
  }

  private async clearTaskTargetResources(
    task: ImportTaskModel,
    serviceLabel: string,
  ) {
    const conn = await this.resolveOpenVikingConnection(task.tenantId);

    try {
      await this.ovClient.request(
        conn,
        `/api/v1/fs?uri=${encodeURIComponent(
          this.toEngineResourceUri(task.targetUri),
        )}&recursive=true`,
        'DELETE',
        undefined,
        { user: conn.user || undefined },
        { serviceLabel },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      if (message.includes('404') || message.includes('NOT_FOUND')) {
        return;
      }
      throw error;
    }
  }

  private async resolveOpenVikingConnection(tenantId: string | null) {
    const rawConn = await this.settings.resolveOVConfig(tenantId);
    return {
      baseUrl: rawConn.baseUrl || '',
      apiKey: rawConn.apiKey || '',
      account: rawConn.account || 'default',
      user: rawConn.user || '',
      rerankEndpoint: rawConn.rerankEndpoint || '',
      rerankModel: rawConn.rerankModel || '',
    };
  }
}
