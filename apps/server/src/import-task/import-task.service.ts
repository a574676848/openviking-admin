import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Inject,
  Logger,
} from '@nestjs/common';
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
import { TaskStatus } from '../common/constants/system.enum';
import { KNOWLEDGE_BASE_REPOSITORY } from '../knowledge-base/domain/repositories/knowledge-base.repository.interface';
import type { IKnowledgeBaseRepository } from '../knowledge-base/domain/repositories/knowledge-base.repository.interface';
import { IKnowledgeNodeRepository } from '../knowledge-tree/domain/repositories/knowledge-node.repository.interface';
import type { KnowledgeNodeModel } from '../knowledge-tree/domain/knowledge-node.model';
import type { IKnowledgeNodeRepository as IKnowledgeNodeRepositoryType } from '../knowledge-tree/domain/repositories/knowledge-node.repository.interface';

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
  ) {}

  findAll(tenantId: string | null) {
    return this.taskRepo.findAll(tenantId);
  }

  async findOne(id: string, tenantId: string | null) {
    const task = await this.taskRepo.findById(id, tenantId);
    if (!task) throw new NotFoundException(`导入任务 ${id} 不存在`);
    return task;
  }

  async create(dto: CreateImportTaskDto, tenantId: string) {
    if (['git', 'feishu', 'dingtalk'].includes(dto.sourceType) && !dto.integrationId) {
      throw new BadRequestException('该来源类型必须选择集成凭证');
    }

    const sourceUrls = this.resolveSourceUrls(dto);
    if (sourceUrls.length === 0) {
      throw new BadRequestException('请至少提供一个来源地址');
    }
    this.assertLocalSources(dto.sourceType, sourceUrls);
    const targetUri = await this.resolveTargetUri(dto, tenantId);

    const dispatch = sourceUrls.map((sourceUrl) =>
      this.taskRepo.create({
        ...dto,
        sourceUrl,
        targetUri,
        tenantId,
        status: TaskStatus.PENDING,
      } as Partial<ImportTaskModel>),
    );
    const saved = await this.taskRepo.save(
      dispatch.length === 1 ? dispatch[0] : dispatch,
    );
    return Array.isArray(saved) ? saved[0] : saved;
  }

  async createLocalUpload(
    dto: CreateLocalImportTaskDto,
    files: LocalImportUploadFile[],
    tenantId: string,
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
          targetUri: dto.targetUri,
        },
        tenantId,
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

    const rawConn = await this.settings.resolveOVConfig(task.tenantId);
    const conn = {
      baseUrl: rawConn.baseUrl || '',
      apiKey: rawConn.apiKey || '',
      account: rawConn.account || 'default',
      user: rawConn.user || '',
      rerankEndpoint: rawConn.rerankEndpoint || '',
      rerankModel: rawConn.rerankModel || '',
    };
    try {
      const statData = await this.ovClient.request(
        conn,
        `/api/v1/fs/stat?uri=${encodeURIComponent(task.targetUri)}`,
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
          `/api/v1/fs/tree?uri=${encodeURIComponent(task.targetUri)}&depth=2`,
          'GET',
          undefined,
          { user: conn.user || undefined },
        );
        nodeCount = this.countTreeItems(treeData?.result);
      }

      const vecData = await this.ovClient.request(
        conn,
        `/api/v1/debug/vector/count?uri=${encodeURIComponent(task.targetUri)}`,
        'GET',
        undefined,
        { user: conn.user || undefined },
      );
      const vecResult = vecData?.result as Record<string, unknown> | undefined;
      const vectorCount = this.toNonNegativeNumber(vecResult?.count);

      await this.taskRepo.update(id, { nodeCount, vectorCount });
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

  async retry(id: string, tenantId: string | null) {
    const task = await this.findOne(id, tenantId);
    if (
      ![TaskStatus.FAILED, TaskStatus.CANCELLED].includes(
        task.status as TaskStatus,
      )
    ) {
      throw new ConflictException('只有失败或已取消的任务才能重试');
    }

    await this.taskRepo.update(id, {
      status: TaskStatus.PENDING,
      errorMsg: null,
      updatedAt: new Date(),
    });
    return this.taskRepo.findById(id, tenantId);
  }

  async cancel(id: string, tenantId: string | null) {
    const task = await this.findOne(id, tenantId);
    if (task.status === TaskStatus.RUNNING) {
      throw new ConflictException('任务已进入执行阶段，当前版本不支持中途停止');
    }
    if (task.status !== TaskStatus.PENDING) {
      throw new ConflictException('只有排队中的任务才能取消');
    }

    await this.taskRepo.update(id, {
      status: TaskStatus.CANCELLED,
      errorMsg: '用户已取消排队任务',
      updatedAt: new Date(),
    });
    if (task.sourceType === 'local') {
      await this.localImportStorage.deleteBySourceUrl(task.sourceUrl);
    }
    return this.taskRepo.findById(id, tenantId);
  }
}
