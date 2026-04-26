import type {
  RepositoryFindOneQuery,
  RepositoryFindQuery,
} from '../../../common/repository-query.types';
import type { IntegrationModel } from '../integration.model';

export interface IIntegrationRepository {
  find(options: RepositoryFindQuery<IntegrationModel>): Promise<IntegrationModel[]>;
  findOne(options: RepositoryFindOneQuery<IntegrationModel>): Promise<IntegrationModel | null>;
  save(integration: Partial<IntegrationModel>): Promise<IntegrationModel>;
  remove(integration: IntegrationModel): Promise<IntegrationModel>;
}

export const IIntegrationRepository = Symbol('IIntegrationRepository');
