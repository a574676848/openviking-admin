import type { RepositoryFindQuery } from '../../../common/repository-query.types';
import type { UserModel } from '../../../users/domain/user.model';

export const USER_REPOSITORY = Symbol('USER_REPOSITORY');

export interface IUserRepository {
  findOneByUsername(username: string): Promise<UserModel | null>;
  findOneById(id: string): Promise<UserModel | null>;
  save(user: Partial<UserModel>): Promise<UserModel>;
  create(user: Partial<UserModel>): UserModel;
  find(options?: RepositoryFindQuery<UserModel>): Promise<UserModel[]>;
  delete(id: string): Promise<void>;
}
