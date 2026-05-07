import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateNodeDto, UpdateNodeDto } from './dto/node.dto';
import { IKnowledgeNodeRepository } from './domain/repositories/knowledge-node.repository.interface';
import type {
  KnowledgeNodeKind,
  KnowledgeNodeModel,
} from './domain/knowledge-node.model';
import { SettingsService } from '../settings/settings.service';
import {
  OVClientService,
  type OVConnection,
} from '../common/ov-client.service';

type OpenVikingDeleteConfig = Partial<Omit<OVConnection, 'user'>> & {
  user?: string | null;
};

export interface OpenVikingDeleteContext {
  ovConfig?: OpenVikingDeleteConfig | null;
  user?: string | null;
  skipOpenViking?: boolean;
}

const OPENVIKING_FS_PATH = '/api/v1/fs';
const OPENVIKING_DELETE_LABEL = 'OpenViking 资源删除';
const DEFAULT_OPENVIKING_ACCOUNT = 'default';
const DIRECTORY_URI_SUFFIX = '/';

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
    private readonly settingsService: SettingsService,
    private readonly ovClientService: OVClientService,
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
  ): Promise<KnowledgeNodeModel> {
    return this.nodeRepo.createWithGeneratedUri(dto);
  }

  async createFile(
    dto: CreateNodeDto & { tenantId: string; fileExtension: string },
  ): Promise<KnowledgeNodeModel> {
    return this.nodeRepo.createFileWithGeneratedUri(dto);
  }

  async findOne(
    id: string,
    tenantId: string | null,
  ): Promise<KnowledgeNodeModel> {
    const where: Record<string, string> = { id };
    if (tenantId) where.tenantId = tenantId;
    const node = await this.nodeRepo.findOne({ where });
    if (!node) throw new NotFoundException(`节点不存在`);
    return node;
  }

  async update(
    id: string,
    dto: UpdateNodeDto,
    tenantId: string | null,
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
    Object.assign(node, dto);
    return this.nodeRepo.save(node);
  }

  async touch(
    id: string,
    tenantId: string | null,
  ): Promise<KnowledgeNodeModel> {
    const node = await this.findOne(id, tenantId);
    return this.nodeRepo.save({ ...node, updatedAt: new Date() });
  }

  async remove(
    id: string,
    tenantId: string | null,
    context?: OpenVikingDeleteContext,
  ): Promise<void> {
    const ovConfig = await this.resolveOpenVikingConfig(tenantId, context);
    await this.removeNode(id, tenantId, ovConfig, context?.skipOpenViking);
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
