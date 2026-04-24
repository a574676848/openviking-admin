import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import { KnowledgeNode } from './entities/knowledge-node.entity';
import { CreateNodeDto, UpdateNodeDto } from './dto/node.dto';
import { IKnowledgeNodeRepository } from './domain/repositories/knowledge-node.repository.interface';

@Injectable()
export class KnowledgeTreeService {
  constructor(
    @Inject(IKnowledgeNodeRepository)
    private readonly nodeRepo: IKnowledgeNodeRepository,
  ) {}

  /**
   * 获取某知识库的全量树节点 (层级视图)
   */
  async findByKb(
    kbId: string,
    tenantId: string | null,
  ): Promise<KnowledgeNode[]> {
    const where: any = { kbId };
    if (tenantId) where.tenantId = tenantId;
    return this.nodeRepo.find({
      where,
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });
  }

  /**
   * Phase 2.4: 获取图谱可视化数据 (扁平视图)
   * 返回标准的 { nodes: [], links: [] } 结构
   */
  async getGraphData(kbId: string, tenantId: string | null) {
    const allNodes = await this.findByKb(kbId, tenantId);

    const nodes = allNodes.map((n) => ({
      id: n.id,
      name: n.name,
      val: 1, // 节点权重，未来可根据向量数动态计算
      vikingUri: n.vikingUri,
    }));

    const links = allNodes
      .filter((n) => n.parentId) // 仅处理有父节点的节点
      .map((n) => ({
        source: n.parentId,
        target: n.id,
        label: 'PARENT_OF',
      }));

    return { nodes, links };
  }

  async create(
    dto: CreateNodeDto & { tenantId: string },
  ): Promise<KnowledgeNode> {
    return this.nodeRepo.save(dto);
  }

  async findOne(id: string, tenantId: string | null): Promise<KnowledgeNode> {
    const where: any = { id };
    if (tenantId) where.tenantId = tenantId;
    const node = await this.nodeRepo.findOne({ where });
    if (!node) throw new NotFoundException(`节点不存在`);
    return node;
  }

  async update(
    id: string,
    dto: UpdateNodeDto,
    tenantId: string | null,
  ): Promise<KnowledgeNode> {
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
