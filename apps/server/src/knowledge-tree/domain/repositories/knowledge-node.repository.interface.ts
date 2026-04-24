import { KnowledgeNode } from '../../entities/knowledge-node.entity';

export interface IKnowledgeNodeRepository {
  find(options: any): Promise<KnowledgeNode[]>;
  findOne(options: any): Promise<KnowledgeNode | null>;
  save(node: Partial<KnowledgeNode>): Promise<KnowledgeNode>;
  remove(node: KnowledgeNode): Promise<KnowledgeNode>;
  findAllowedUris(
    tenantId: string,
    user: { id: string; role: string },
  ): Promise<string[]>;
}

export const IKnowledgeNodeRepository = Symbol('IKnowledgeNodeRepository');
