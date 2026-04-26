import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import { CreateNodeDto, UpdateNodeDto } from './dto/node.dto';
import { IKnowledgeNodeRepository } from './domain/repositories/knowledge-node.repository.interface';
import type { KnowledgeNodeModel } from './domain/knowledge-node.model';

@Injectable()
export class KnowledgeTreeService {
  constructor(
    @Inject(IKnowledgeNodeRepository)
    private readonly nodeRepo: IKnowledgeNodeRepository,
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
      vikingUri: n.vikingUri,
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
    return this.nodeRepo.save(dto);
  }

  async findOne(id: string, tenantId: string | null): Promise<KnowledgeNodeModel> {
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
    Object.assign(node, dto);
    return this.nodeRepo.save(node);
  }

  async remove(id: string, tenantId: string | null): Promise<void> {
    const node = await this.findOne(id, tenantId);
    const children = await this.nodeRepo.find({
      where: { parentId: id, tenantId: tenantId ?? undefined },
    });
    for (const child of children) {
      await this.remove(child.id, tenantId);
    }
    await this.nodeRepo.remove(node);
  }
}
