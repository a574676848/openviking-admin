import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, type FindManyOptions } from 'typeorm';
import { User } from '../../../users/entities/user.entity';
import { IUserRepository } from '../../domain/repositories/user.repository.interface';
import type { RepositoryFindQuery } from '../../../common/repository-query.types';
import type { UserModel } from '../../../users/domain/user.model';

@Injectable()
export class UserRepository implements IUserRepository {
  constructor(
    @InjectRepository(User)
    private readonly defaultRepo: Repository<User>,
  ) {}

  private get repo(): Repository<User> {
    return this.defaultRepo;
  }

  private toModel(entity: User): UserModel {
    return {
      id: entity.id,
      username: entity.username,
      passwordHash: entity.passwordHash,
      role: entity.role,
      tenantId: entity.tenantId,
      active: entity.active,
      ssoId: entity.ssoId,
      provider: entity.provider,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }

  private toEntityInput(user: Partial<UserModel>): Partial<User> {
    return {
      id: user.id,
      username: user.username,
      passwordHash: user.passwordHash,
      role: user.role,
      tenantId: user.tenantId ?? undefined,
      active: user.active,
      ssoId: user.ssoId ?? undefined,
      provider: user.provider ?? undefined,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  async findOneByUsername(username: string): Promise<UserModel | null> {
    const item = await this.repo.findOne({ where: { username } });
    return item ? this.toModel(item) : null;
  }

  async findOneById(id: string): Promise<UserModel | null> {
    const item = await this.repo.findOne({ where: { id } });
    return item ? this.toModel(item) : null;
  }

  async save(user: Partial<UserModel>): Promise<UserModel> {
    const saved = await this.repo.save(this.toEntityInput(user));
    return this.toModel(saved);
  }

  create(user: Partial<UserModel>): UserModel {
    return this.toModel(this.repo.create(this.toEntityInput(user)));
  }

  async find(options?: RepositoryFindQuery<UserModel>): Promise<UserModel[]> {
    const items = await this.repo.find((options ?? {}) as FindManyOptions<User>);
    return items.map((item) => this.toModel(item));
  }

  async delete(id: string): Promise<void> {
    await this.repo.delete(id);
  }
}
