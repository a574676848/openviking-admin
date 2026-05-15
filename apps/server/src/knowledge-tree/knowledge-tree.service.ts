import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CreateNodeDto, UpdateNodeDto } from './dto/node.dto';
import { IKnowledgeNodeRepository } from './domain/repositories/knowledge-node.repository.interface';
import type {
  KnowledgeNodeIndexStatus,
  KnowledgeNodeKind,
  KnowledgeNodeModel,
} from './domain/knowledge-node.model';
import { KNOWLEDGE_BASE_REPOSITORY } from '../knowledge-base/domain/repositories/knowledge-base.repository.interface';
import type { IKnowledgeBaseRepository } from '../knowledge-base/domain/repositories/knowledge-base.repository.interface';
import { SettingsService } from '../settings/settings.service';
import { DynamicDataSourceService } from '../common/dynamic-datasource.service';
import { TenantIsolationLevel } from '../common/constants/system.enum';
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
import { KnowledgeNode } from './entities/knowledge-node.entity';
import { TenantCacheService } from '../tenant/tenant-cache.service';

type OpenVikingDeleteConfig = Partial<Omit<OVConnection, 'user'>> & {
  user?: string | null;
};

export interface OpenVikingDeleteContext {
  ovConfig?: OpenVikingDeleteConfig | null;
  user?: string | null;
  skipOpenViking?: boolean;
  skipKnowledgeBaseStatsRefresh?: boolean;
}

const OPENVIKING_FS_PATH = '/api/v1/fs';
const OPENVIKING_DELETE_LABEL = 'OpenViking 资源删除';
const DEFAULT_OPENVIKING_ACCOUNT = 'default';
const DIRECTORY_URI_SUFFIX = '/';
const FILE_EXTENSION_PATTERN = /\.[^.\s/\\]+$/;

@Injectable()
export class KnowledgeTreeService {
  private static readonly IMMUTABLE_FIELDS = [
    'kind',
    'vikingUri',
    'contentUri',
  ] as const;

  constructor(
    @Inject(IKnowledgeNodeRepository)
    private readonly nodeRepo: IKnowledgeNodeRepository,
    @Inject(KNOWLEDGE_BASE_REPOSITORY)
    private readonly kbRepo: IKnowledgeBaseRepository,
    private readonly settingsService: SettingsService,
    private readonly ovClientService: OVClientService,
    private readonly documentSessionRegistry: DocumentSessionRegistry,
    @Optional() private readonly defaultDataSource?: DataSource,
    @Optional()
    private readonly dynamicDataSourceService?: DynamicDataSourceService,
    @Optional() private readonly tenantCacheService?: TenantCacheService,
  ) {}

  async findByKb(
    kbId: string,
    tenantId: string | null,
  ): Promise<KnowledgeNodeModel[]> {
    const where: Record<string, string> = { kbId };
    if (tenantId) where.tenantId = tenantId;
    return this.nodeRepo.find({
      where,
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });
  }

  async findChildrenWithCount(
    kbId: string,
    parentId: string | null,
    tenantId: string | null,
  ): Promise<(KnowledgeNodeModel & { childrenCount: number })[]> {
    return this.nodeRepo.findChildrenWithCount(kbId, parentId, tenantId);
  }

  aggregateKnowledgeBaseStats(kbId: string, tenantId: string | null) {
    return this.nodeRepo.aggregateKnowledgeBaseStats(kbId, tenantId);
  }

  async findLineageWithSiblings(
    kbId: string,
    nodeId: string,
    tenantId: string | null,
  ): Promise<(KnowledgeNodeModel & { childrenCount: number })[]> {
    return this.nodeRepo.findLineageWithSiblings(kbId, nodeId, tenantId);
  }

  async getGraphData(kbId: string, tenantId: string | null) {
    const allNodes = await this.findByKb(kbId, tenantId);

    const nodes = allNodes.map((n) => ({
      id: n.id,
      name: n.name,
      val: 1,
      kind: n.kind,
      vikingUri: n.vikingUri,
      contentUri: n.contentUri,
    }));

    const links = allNodes
      .filter((n) => n.parentId)
      .map((n) => ({
        source: n.parentId,
        target: n.id,
        label: 'PARENT_OF',
      }));

    return { nodes, links };
  }

  async create(
    dto: CreateNodeDto & { tenantId: string },
    actor?: AuditActorSnapshot | null,
  ): Promise<KnowledgeNodeModel> {
    return this.nodeRepo.createWithGeneratedUri(
      applyCreatedAuditActor(dto, actor),
    );
  }

  async createFile(
    dto: CreateNodeDto & { tenantId: string; fileExtension: string },
    actor?: AuditActorSnapshot | null,
  ): Promise<KnowledgeNodeModel> {
    const fileDto = {
      ...dto,
      name: this.ensureFileNameExtension(dto.name, dto.fileExtension),
    };

    return this.nodeRepo.createFileWithGeneratedUri(
      applyCreatedAuditActor(fileDto, actor),
    );
  }

  async findOne(
    id: string,
    tenantId: string | null,
  ): Promise<KnowledgeNodeModel> {
    const where: Record<string, string> = { id };
    if (tenantId) where.tenantId = tenantId;
    const node =
      (await this.nodeRepo.findOne({ where })) ??
      (tenantId ? await this.findOneWithTenantRouting(id, tenantId) : null);
    if (!node) throw new NotFoundException(`节点不存在`);
    return node;
  }

  private async findOneWithTenantRouting(
    id: string,
    tenantId: string,
  ): Promise<KnowledgeNodeModel | null> {
    if (
      !this.defaultDataSource ||
      !this.dynamicDataSourceService ||
      !this.tenantCacheService
    ) {
      return null;
    }

    const isolationConfig =
      await this.tenantCacheService.getIsolationConfig(tenantId);
    if (!isolationConfig) {
      return null;
    }

    if (isolationConfig.level === TenantIsolationLevel.LARGE) {
      if (!isolationConfig.dbConfig) {
        return null;
      }

      const tenantDataSource =
        await this.dynamicDataSourceService.getTenantDataSource(
          isolationConfig.tenantId,
          isolationConfig.dbConfig,
        );
      const entity = await tenantDataSource
        .getRepository(KnowledgeNode)
        .findOne({
          where: { id, tenantId },
        });
      return entity ? this.toModel(entity) : null;
    }

    if (isolationConfig.level === TenantIsolationLevel.MEDIUM) {
      const queryRunner = this.defaultDataSource.createQueryRunner();
      await queryRunner.connect();
      try {
        await queryRunner.query(
          `SET search_path TO "tenant_${tenantId.replace(/-/g, '_')}", public`,
        );
        const entity = await queryRunner.manager
          .getRepository(KnowledgeNode)
          .findOne({
            where: { id, tenantId },
          });
        return entity ? this.toModel(entity) : null;
      } finally {
        if (!queryRunner.isReleased) {
          await queryRunner.release();
        }
      }
    }

    const entity = await this.defaultDataSource
      .getRepository(KnowledgeNode)
      .findOne({
        where: { id, tenantId },
      });
    return entity ? this.toModel(entity) : null;
  }

  private toModel(entity: KnowledgeNode): KnowledgeNodeModel {
    const kind =
      entity.kind === 'collection' || entity.kind === 'document'
        ? entity.kind
        : entity.vikingUri?.endsWith(DIRECTORY_URI_SUFFIX)
          ? 'collection'
          : 'document';
    const contentUri =
      entity.contentUri ??
      (kind === 'document' &&
      entity.vikingUri &&
      !entity.vikingUri.endsWith(DIRECTORY_URI_SUFFIX)
        ? entity.vikingUri
        : null);

    return {
      id: entity.id,
      tenantId: entity.tenantId,
      kbId: entity.kbId,
      parentId: entity.parentId,
      name: entity.name,
      path: entity.path,
      sortOrder: entity.sortOrder,
      acl: entity.acl,
      kind,
      vikingUri: entity.vikingUri,
      contentUri,
      indexStatus: entity.indexStatus ?? 'clean',
      draftVersion: entity.draftVersion ?? 0,
      indexedVersion: entity.indexedVersion ?? 0,
      vectorCount: entity.vectorCount ?? null,
      lastIndexedAt: entity.lastIndexedAt ?? null,
      indexError: entity.indexError ?? null,
      createdById: entity.createdById,
      createdByName: entity.createdByName,
      updatedById: entity.updatedById,
      updatedByName: entity.updatedByName,
      createdBy:
        entity.createdById || entity.createdByName
          ? { id: entity.createdById, username: entity.createdByName }
          : null,
      updatedBy:
        entity.updatedById || entity.updatedByName
          ? { id: entity.updatedById, username: entity.updatedByName }
          : null,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }

  async update(
    id: string,
    dto: UpdateNodeDto,
    tenantId: string | null,
    actor?: AuditActorSnapshot | null,
  ): Promise<KnowledgeNodeModel> {
    const node = await this.findOne(id, tenantId);
    if (
      'vikingUri' in dto &&
      dto.vikingUri !== undefined &&
      dto.vikingUri !== node.vikingUri
    ) {
      throw new BadRequestException('字段 vikingUri 不允许修改。');
    }
    if (
      'contentUri' in dto &&
      dto.contentUri !== undefined &&
      dto.contentUri !== node.contentUri
    ) {
      throw new BadRequestException('字段 contentUri 不允许修改。');
    }
    if (this.isSubtreeAffectingUpdate(dto, node)) {
      const nodeIds = await this.collectSubtreeNodeIds(id, tenantId);
      this.documentSessionRegistry.assertNoActiveSessionInNodes(nodeIds);
    }
    Object.assign(node, applyUpdatedAuditActor(dto, actor));
    return this.nodeRepo.save(node);
  }

  async touch(
    id: string,
    tenantId: string | null,
    actor?: AuditActorSnapshot | null,
  ): Promise<KnowledgeNodeModel> {
    const node = await this.findOne(id, tenantId);
    return this.nodeRepo.save(
      applyUpdatedAuditActor({ ...node, updatedAt: new Date() }, actor),
    );
  }

  async syncContentUri(
    id: string,
    contentUri: string,
    tenantId: string | null,
    actor?: AuditActorSnapshot | null,
  ): Promise<KnowledgeNodeModel> {
    const node = await this.findOne(id, tenantId);
    return this.nodeRepo.save(
      applyUpdatedAuditActor(
        {
          ...node,
          contentUri,
          updatedAt: new Date(),
        },
        actor,
      ),
    );
  }

  async syncIndexState(
    id: string,
    tenantId: string | null,
    state: {
      contentUri?: string | null;
      indexStatus?: KnowledgeNodeIndexStatus;
      draftVersion?: number;
      indexedVersion?: number;
      vectorCount?: number | null;
      lastIndexedAt?: Date | null;
      indexError?: string | null;
    },
    actor?: AuditActorSnapshot | null,
  ): Promise<KnowledgeNodeModel> {
    const node = await this.findOne(id, tenantId);
    return this.nodeRepo.save(
      applyUpdatedAuditActor(
        {
          ...node,
          ...state,
          updatedAt: new Date(),
        },
        actor,
      ),
    );
  }

  async remove(
    id: string,
    tenantId: string | null,
    context?: OpenVikingDeleteContext,
  ): Promise<void> {
    const node = await this.findOne(id, tenantId);
    const nodeIds = await this.collectSubtreeNodeIds(id, tenantId);
    this.documentSessionRegistry.assertNoActiveSessionInNodes(nodeIds);

    const ovConfig = await this.resolveOpenVikingConfig(tenantId, context);
    await this.removeNode(id, tenantId, ovConfig, context?.skipOpenViking);
    if (!context?.skipKnowledgeBaseStatsRefresh) {
      await this.refreshKnowledgeBaseStats(node.kbId, tenantId);
    }
  }

  private isSubtreeAffectingUpdate(
    dto: UpdateNodeDto,
    node: KnowledgeNodeModel,
  ): boolean {
    if ('parentId' in dto && dto.parentId !== undefined) {
      return dto.parentId !== node.parentId;
    }

    if ('name' in dto && dto.name !== undefined) {
      return dto.name !== node.name;
    }

    if ('path' in dto && dto.path !== undefined) {
      return dto.path !== node.path;
    }

    return false;
  }

  private ensureFileNameExtension(name: string, fileExtension: string): string {
    const normalizedName = name.trim();
    return FILE_EXTENSION_PATTERN.test(normalizedName)
      ? normalizedName
      : `${normalizedName}${fileExtension}`;
  }

  private async collectSubtreeNodeIds(
    id: string,
    tenantId: string | null,
  ): Promise<string[]> {
    const children = await this.nodeRepo.find({
      where: { parentId: id, tenantId: tenantId ?? undefined },
    });
    const childNodeIds = await Promise.all(
      children.map((child) => this.collectSubtreeNodeIds(child.id, tenantId)),
    );

    return [id, ...childNodeIds.flat()];
  }

  private async removeNode(
    id: string,
    tenantId: string | null,
    ovConfig: OVConnection,
    skipOpenViking = false,
  ): Promise<void> {
    const node = await this.findOne(id, tenantId);
    const children = await this.nodeRepo.find({
      where: { parentId: id, tenantId: tenantId ?? undefined },
    });
    for (const child of children) {
      await this.removeNode(child.id, tenantId, ovConfig, skipOpenViking);
    }
    if (!skipOpenViking) {
      await this.deleteOpenVikingResource(
        node.vikingUri,
        ovConfig,
        this.shouldDeleteRecursively(node),
      );
    }
    await this.nodeRepo.remove(node);
  }

  private async refreshKnowledgeBaseStats(
    kbId: string,
    tenantId: string | null,
  ): Promise<void> {
    const kb = await this.kbRepo.findById(kbId, tenantId);
    if (!kb) {
      return;
    }

    const stats = await this.aggregateKnowledgeBaseStats(kbId, tenantId);
    await this.kbRepo.save({
      ...kb,
      docCount: stats.docCount,
      vectorCount: stats.vectorCount,
      updatedAt: new Date(),
    });
  }

  private shouldDeleteRecursively(node: KnowledgeNodeModel): boolean {
    if (node.kind === 'collection') {
      return true;
    }

    if (node.kind === 'document' && node.contentUri) {
      return true;
    }

    return node.vikingUri?.endsWith(DIRECTORY_URI_SUFFIX) ?? false;
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
