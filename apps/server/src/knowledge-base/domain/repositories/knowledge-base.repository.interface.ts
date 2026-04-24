import { KnowledgeBase } from '../../entities/knowledge-base.entity';

export const KNOWLEDGE_BASE_REPOSITORY = Symbol('IKnowledgeBaseRepository');

export interface IKnowledgeBaseRepository {
  findAll(tenantId: string | null): Promise<KnowledgeBase[]>;
  findById(id: string, tenantId?: string | null): Promise<KnowledgeBase | null>;
  count(options?: any): Promise<number>;
  create(data: Partial<KnowledgeBase>): KnowledgeBase;
  save(kb: KnowledgeBase): Promise<KnowledgeBase>;
  delete(kb: KnowledgeBase): Promise<void>;
}
