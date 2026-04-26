import { Injectable, Inject, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, type FindManyOptions } from 'typeorm';
import { User } from '../../entities/user.entity';
import { IUserRepository } from '../../domain/repositories/user.repository.interface';
import type { UserModel } from '../../domain/user.model';
import type { RepositoryRequest } from '../../../common/repository-request.interface';
import type { RepositoryFindQuery } from '../../../common/repository-query.types';

@Injectable({ scope: Scope.REQUEST })
export class TypeOrmUserRepository implements IUserRepository {
  constructor(
    @Inject(REQUEST) private readonly request: RepositoryRequest,
    @InjectRepository(User)
    private readonly defaultRepo: Repository<User>,
  ) {}

  private get repo(): Repository<User> {
    if (this.request?.tenantQueryRunner) {
      return this.request.tenantQueryRunner.manager.getRepository(User);
    }
    if (this.request?.tenantDataSource) {
      return this.request.tenantDataSource.getRepository(User);
    }
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

  async findAll(tenantId: string | null): Promise<UserModel[]> {
    const where = tenantId ? { tenantId } : {};
    const items = await this.repo.find({ where, order: { createdAt: 'DESC' } });
    return items.map((item) => this.toModel(item));
  }

  async findById(id: string, tenantId?: string | null): Promise<UserModel | null> {
    const where: Record<string, string> = { id };
    if (tenantId) where.tenantId = tenantId;
    const item = await this.repo.findOne({ where });
    return item ? this.toModel(item) : null;
  }

  async findByUsername(username: string): Promise<UserModel | null> {
    const item = await this.repo.findOne({ where: { username } });
    return item ? this.toModel(item) : null;
  }

  create(data: Partial<UserModel>): UserModel {
    return this.toModel(this.repo.create(this.toEntityInput(data)));
  }

  async save(user: Partial<UserModel>): Promise<UserModel> {
    const saved = await this.repo.save(this.toEntityInput(user));
    return this.toModel(saved);
  }

  async delete(id: string): Promise<void> {
    await this.repo.delete(id);
  }

  async find(options?: RepositoryFindQuery<UserModel>): Promise<UserModel[]> {
    const items = await this.repo.find((options ?? {}) as FindManyOptions<User>);
    return items.map((item) => this.toModel(item));
  }
}
