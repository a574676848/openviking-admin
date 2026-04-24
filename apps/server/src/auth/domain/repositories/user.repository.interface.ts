import { User } from '../../../users/entities/user.entity';

export const USER_REPOSITORY = Symbol('USER_REPOSITORY');

export interface IUserRepository {
  findOneByUsername(username: string): Promise<User | null>;
  findOneById(id: string): Promise<User | null>;
  save(user: Partial<User>): Promise<User>;
  create(user: Partial<User>): User;
  find(options?: any): Promise<User[]>;
  delete(id: string): Promise<void>;
}
