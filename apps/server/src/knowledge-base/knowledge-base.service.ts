import {
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  ForbiddenException,
  Inject,
  Logger,
} from '@nestjs/common';
import { CreateKnowledgeBaseDto } from './dto/create-kb.dto';
import { TenantService } from '../tenant/tenant.service';
import { KNOWLEDGE_BASE_REPOSITORY } from './domain/repositories/knowledge-base.repository.interface';
import type { IKnowledgeBaseRepository } from './domain/repositories/knowledge-base.repository.interface';
import type { KnowledgeBaseModel } from './domain/knowledge-base.model';
import type { KnowledgeBaseStatus } from './domain/knowledge-base.model';
import {
  KnowledgeTreeService,
  type OpenVikingDeleteContext,
} from '../knowledge-tree/knowledge-tree.service';
import { SettingsService } from '../settings/settings.service';
import {
  OVClientService,
  type OVConnection,
} from '../common/ov-client.service';

const OPENVIKING_FS_PATH = '/api/v1/fs';
const OPENVIKING_FS_TREE_PATH = '/api/v1/fs/tree';
const OPENVIKING_VECTOR_COUNT_PATH = '/api/v1/debug/vector/count';
const OPENVIKING_DELETE_LABEL = 'OpenViking 资源删除';
const DEFAULT_OPENVIKING_ACCOUNT = 'default';
const ARCHIVED_KNOWLEDGE_BASE_STATUS: KnowledgeBaseStatus = 'archived';

@Injectable()
export class KnowledgeBaseService {
  private readonly logger = new Logger(KnowledgeBaseService.name);

  constructor(
    @Inject(KNOWLEDGE_BASE_REPOSITORY)
    private readonly kbRepo: IKnowledgeBaseRepository,
    private readonly tenantService: TenantService,
    private readonly knowledgeTreeService: KnowledgeTreeService,
    private readonly settingsService: SettingsService,
    private readonly ovClientService: OVClientService,
  ) {}

  findAll(tenantId: string | null) {
    return this.kbRepo
      .findAll(tenantId)
      .then((items) =>
        items.filter((item) => item.status !== ARCHIVED_KNOWLEDGE_BASE_STATUS),
      );
  }

  async findAllWithRuntimeStats(tenantId: string | null) {
    const items = await this.findAll(tenantId);
    return this.refreshRuntimeStats(items, tenantId);
  }

  async findOne(id: string, tenantId: string | null) {
    const kb = await this.kbRepo.findById(id, tenantId);
    if (!kb || kb.status === ARCHIVED_KNOWLEDGE_BASE_STATUS) {
      throw new NotFoundException(`知识库 ${id} 不存在或无权访问`);
    }
    return kb;
  }

  async findOneWithRuntimeStats(id: string, tenantId: string | null) {
    const kb = await this.findOne(id, tenantId);
    const [refreshed] = await this.refreshRuntimeStats([kb], tenantId);
    return refreshed;
  }

  async create(dto: CreateKnowledgeBaseDto & { tenantId: string }) {
    const tenant = await this.tenantService.findOneByIdOrTenantId(dto.tenantId);
    const currentCount = (await this.findAll(tenant.tenantId)).length;

    const maxDocs =
      (tenant.quota as Record<string, number> | undefined)?.maxDocs || 0;
    if (maxDocs > 0 && currentCount >= maxDocs) {
      throw new ForbiddenException(
        `已达到租户知识库配额上限 (${maxDocs})，请联系管理员扩容`,
      );
    }

    const tenantIdentifier = tenant.tenantId;
    return this.kbRepo.createWithUri({
      ...dto,
      tenantId: tenantIdentifier,
    });
  }

  async update(
    id: string,
    attrs: Partial<KnowledgeBaseModel>,
    tenantId: string | null,
  ) {
    const kb = await this.kbRepo.findById(id, tenantId);
    if (!kb) {
      throw new NotFoundException(`知识库 ${id} 不存在或无权访问`);
    }
    Object.assign(kb, attrs);
    return this.kbRepo.save(kb);
  }

  async remove(
    id: string,
    tenantId: string | null,
    context?: OpenVikingDeleteContext,
  ) {
    const kb = await this.kbRepo.findById(id, tenantId);
    if (!kb) {
      throw new NotFoundException(`知识库 ${id} 不存在或无权访问`);
    }
    const ovConfig = await this.resolveOpenVikingConfig(tenantId, context);
    const nodes = await this.knowledgeTreeService.findByKb(kb.id, tenantId);
    const nodeIds = new Set(nodes.map((node) => node.id));
    const rootNodes = nodes.filter(
      (node) => !node.parentId || !nodeIds.has(node.parentId),
    );

    await this.deleteOpenVikingResource(kb.vikingUri, ovConfig, true);

    for (const node of rootNodes) {
      await this.knowledgeTreeService.remove(node.id, tenantId, {
        ovConfig,
        user: ovConfig.user,
        skipOpenViking: true,
      });
    }

    return this.kbRepo.delete(kb);
  }

  private async resolveOpenVikingConfig(
    tenantId: string | null,
    context?: OpenVikingDeleteContext,
  ): Promise<OVConnection> {
    const rawConfig =
      context?.ovConfig ??
      (await this.settingsService.resolveOVConfig(tenantId));

    return {
      baseUrl: rawConfig.baseUrl || '',
      apiKey: rawConfig.apiKey || '',
      account: rawConfig.account || DEFAULT_OPENVIKING_ACCOUNT,
      user: rawConfig.user || context?.user || undefined,
    };
  }

  private async deleteOpenVikingResource(
    vikingUri: string | null,
    ovConfig: OVConnection,
    recursive: boolean,
  ): Promise<void> {
    if (!vikingUri) return;

    try {
      await this.ovClientService.request(
        ovConfig,
        `${OPENVIKING_FS_PATH}?uri=${encodeURIComponent(vikingUri)}&recursive=${recursive}`,
        'DELETE',
        undefined,
        { user: ovConfig.user },
        { serviceLabel: OPENVIKING_DELETE_LABEL },
      );
    } catch (error) {
      if (
        error instanceof HttpException &&
        error.getStatus() === HttpStatus.NOT_FOUND
      ) {
        return;
      }
      throw error;
    }
  }

  private async refreshRuntimeStats(
    items: KnowledgeBaseModel[],
    tenantId: string | null,
  ) {
    if (!tenantId || items.length === 0) {
      return items;
    }

    const ovConfig = await this.resolveOpenVikingConfig(tenantId);
    return Promise.all(
      items.map((item) => this.refreshSingleKnowledgeBaseStats(item, ovConfig)),
    );
  }

  private async refreshSingleKnowledgeBaseStats(
    kb: KnowledgeBaseModel,
    ovConfig: OVConnection,
  ): Promise<KnowledgeBaseModel> {
    if (!kb.vikingUri?.trim()) {
      return kb;
    }

    try {
      const [treeData, vecData] = await Promise.all([
        this.ovClientService.request(
          ovConfig,
          `${OPENVIKING_FS_TREE_PATH}?uri=${encodeURIComponent(kb.vikingUri)}`,
          'GET',
          undefined,
          { user: ovConfig.user },
        ),
        this.ovClientService.request(
          ovConfig,
          `${OPENVIKING_VECTOR_COUNT_PATH}?uri=${encodeURIComponent(kb.vikingUri)}`,
          'GET',
          undefined,
          { user: ovConfig.user },
        ),
      ]);

      const docCount = this.countDocumentsFromTree(treeData?.result);
      const vectorCount = this.toNonNegativeNumber(
        (vecData?.result as Record<string, unknown> | undefined)?.count,
      );

      if (kb.docCount === docCount && kb.vectorCount === vectorCount) {
        return kb;
      }

      return this.kbRepo.save({
        ...kb,
        docCount,
        vectorCount,
      });
    } catch (error) {
      if (this.isOpenVikingNotFound(error)) {
        if (kb.docCount === 0 && kb.vectorCount === 0) {
          return kb;
        }

        return this.kbRepo.save({
          ...kb,
          docCount: 0,
          vectorCount: 0,
        });
      }

      const message = error instanceof Error ? error.message : '未知错误';
      this.logger.warn(
        `刷新知识库统计失败，保留已有计数: ${kb.id} (${message})`,
      );
      return kb;
    }
  }

  private countDocumentsFromTree(result: unknown) {
    if (!Array.isArray(result)) {
      return 0;
    }

    return result.filter((item) => {
      if (!item || typeof item !== 'object') {
        return false;
      }

      return (item as { isDir?: unknown }).isDir === false;
    }).length;
  }

  private toNonNegativeNumber(value: unknown) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  }

  private isOpenVikingNotFound(error: unknown) {
    return error instanceof HttpException && error.getStatus() === HttpStatus.NOT_FOUND;
  }
}
