import type {
  RepositoryFindOneQuery,
  RepositoryFindQuery,
} from '../../../common/repository-query.types';
import type { SystemConfigModel } from '../system-config.model';

export interface ISystemConfigRepository {
  find(options?: RepositoryFindQuery<SystemConfigModel>): Promise<SystemConfigModel[]>;
  findOne(options: RepositoryFindOneQuery<SystemConfigModel>): Promise<SystemConfigModel | null>;
  save(config: Partial<SystemConfigModel>): Promise<SystemConfigModel>;
}

export const ISystemConfigRepository = Symbol('ISystemConfigRepository');
