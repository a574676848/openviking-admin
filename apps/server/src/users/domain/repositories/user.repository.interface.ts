import type { RepositoryFindQuery } from '../../../common/repository-query.types';
import type { UserModel } from '../user.model';

export const USER_REPOSITORY = Symbol('IUserRepository');

export interface IUserRepository {
  findAll(tenantId: string | null): Promise<UserModel[]>;
  findById(id: string, tenantId?: string | null): Promise<UserModel | null>;
  findByUsername(
    username: string,
    tenantId?: string | null,
  ): Promise<UserModel | null>;
  create(data: Partial<UserModel>): UserModel;
  save(user: Partial<UserModel>): Promise<UserModel>;
  delete(id: string): Promise<void>;
  find(options?: RepositoryFindQuery<UserModel>): Promise<UserModel[]>;
}
