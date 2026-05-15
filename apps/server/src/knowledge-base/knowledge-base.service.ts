import {
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  ForbiddenException,
  Inject,
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
import { DocumentSessionRegistry } from '../common/document-session-registry';
import {
  applyCreatedAuditActor,
  applyUpdatedAuditActor,
  type AuditActorSnapshot,
} from '../common/audit-actor.types';

const OPENVIKING_FS_PATH = '/api/v1/fs';
const OPENVIKING_DELETE_LABEL = 'OpenViking 资源删除';
const DEFAULT_OPENVIKING_ACCOUNT = 'default';
const ARCHIVED_KNOWLEDGE_BASE_STATUS: KnowledgeBaseStatus = 'archived';
const KNOWLEDGE_BASE_LOCK_MESSAGE = '目标知识库正在被协作编辑';

@Injectable()
export class KnowledgeBaseService {
  constructor(
    @Inject(KNOWLEDGE_BASE_REPOSITORY)
    private readonly kbRepo: IKnowledgeBaseRepository,
    private readonly tenantService: TenantService,
    private readonly knowledgeTreeService: KnowledgeTreeService,
    private readonly settingsService: SettingsService,
    private readonly ovClientService: OVClientService,
    private readonly documentSessionRegistry: DocumentSessionRegistry,
  ) {}

  findAll(tenantId: string | null) {
    return this.kbRepo
      .findAll(tenantId)
      .then((items) =>
        items.filter((item) => item.status !== ARCHIVED_KNOWLEDGE_BASE_STATUS),
      );
  }

  async findAllPaginated(
    tenantId: string | null,
    page: number,
    pageSize: number,
    q?: string,
  ) {
    return this.kbRepo.findAllPaginated(tenantId, page, pageSize, q);
  }

  async findOne(id: string, tenantId: string | null) {
    const kb = await this.kbRepo.findById(id, tenantId);
    if (!kb || kb.status === ARCHIVED_KNOWLEDGE_BASE_STATUS) {
      throw new NotFoundException(`知识库 ${id} 不存在或无权访问`);
    }
    return kb;
  }

  async refreshStatsFromNodes(
    id: string,
    tenantId: string | null,
    actor?: AuditActorSnapshot | null,
  ): Promise<KnowledgeBaseModel> {
    const kb = await this.kbRepo.findById(id, tenantId);
    if (!kb || kb.status === ARCHIVED_KNOWLEDGE_BASE_STATUS) {
      throw new NotFoundException(`知识库 ${id} 不存在或无权访问`);
    }

    const stats = await this.knowledgeTreeService.aggregateKnowledgeBaseStats(
      id,
      tenantId,
    );
    return this.kbRepo.save(
      applyUpdatedAuditActor(
        {
          ...kb,
          docCount: stats.docCount,
          vectorCount: stats.vectorCount,
          updatedAt: new Date(),
        },
        actor,
      ),
    );
  }

  async create(
    dto: CreateKnowledgeBaseDto & { tenantId: string },
    actor?: AuditActorSnapshot | null,
  ) {
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
    return this.kbRepo.createWithUri(
      applyCreatedAuditActor(
        {
          ...dto,
          tenantId: tenantIdentifier,
        },
        actor,
      ),
    );
  }

  async update(
    id: string,
    attrs: Partial<KnowledgeBaseModel>,
    tenantId: string | null,
    actor?: AuditActorSnapshot | null,
  ) {
    const kb = await this.kbRepo.findById(id, tenantId);
    if (!kb) {
      throw new NotFoundException(`知识库 ${id} 不存在或无权访问`);
    }
    Object.assign(kb, applyUpdatedAuditActor(attrs, actor));
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
    if (this.documentSessionRegistry.hasActiveSessionInKb(kb.id)) {
      throw new HttpException(KNOWLEDGE_BASE_LOCK_MESSAGE, HttpStatus.LOCKED);
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
        skipKnowledgeBaseStatsRefresh: true,
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
}
