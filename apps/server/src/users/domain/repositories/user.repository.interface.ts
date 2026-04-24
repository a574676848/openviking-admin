import { User } from '../../entities/user.entity';

export const USER_REPOSITORY = Symbol('IUserRepository');

export interface IUserRepository {
  findAll(tenantId: string | null): Promise<User[]>;
  findById(id: string, tenantId?: string | null): Promise<User | null>;
  findByUsername(username: string): Promise<User | null>;
  create(data: Partial<User>): User;
  save(user: Partial<User>): Promise<User>;
  delete(id: string): Promise<void>;
  find(options?: any): Promise<User[]>;
}
