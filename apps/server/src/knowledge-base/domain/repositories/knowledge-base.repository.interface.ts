import type { KnowledgeBaseModel } from '../knowledge-base.model';
import type { RepositoryFindQuery } from '../../../common/repository-query.types';

export const KNOWLEDGE_BASE_REPOSITORY = Symbol('IKnowledgeBaseRepository');

export interface IKnowledgeBaseRepository {
  findAll(tenantId: string | null): Promise<KnowledgeBaseModel[]>;
  findById(id: string, tenantId?: string | null): Promise<KnowledgeBaseModel | null>;
  count(options?: RepositoryFindQuery<KnowledgeBaseModel>): Promise<number>;
  create(data: Partial<KnowledgeBaseModel>): KnowledgeBaseModel;
  save(kb: KnowledgeBaseModel): Promise<KnowledgeBaseModel>;
  delete(kb: KnowledgeBaseModel): Promise<void>;
  /** 在事务内创建知识库并自动补全完整 URI */
  createWithUri(data: Partial<KnowledgeBaseModel>): Promise<KnowledgeBaseModel>;
}
