import type {
  RepositoryFindOneQuery,
  RepositoryFindQuery,
} from '../../../common/repository-query.types';
import type { KnowledgeNodeModel } from '../knowledge-node.model';

export interface IKnowledgeNodeRepository {
  find(
    options: RepositoryFindQuery<KnowledgeNodeModel>,
  ): Promise<KnowledgeNodeModel[]>;
  findOne(
    options: RepositoryFindOneQuery<KnowledgeNodeModel>,
  ): Promise<KnowledgeNodeModel | null>;
  save(node: Partial<KnowledgeNodeModel>): Promise<KnowledgeNodeModel>;
  createWithGeneratedUri(
    node: Partial<KnowledgeNodeModel>,
  ): Promise<KnowledgeNodeModel>;
  createFileWithGeneratedUri(
    node: Partial<KnowledgeNodeModel> & { fileExtension: string },
  ): Promise<KnowledgeNodeModel>;
  remove(node: KnowledgeNodeModel): Promise<KnowledgeNodeModel>;
  findAllowedUris(
    tenantId: string,
    user: { id: string; role: string },
  ): Promise<string[]>;
}

export const IKnowledgeNodeRepository = Symbol('IKnowledgeNodeRepository');
