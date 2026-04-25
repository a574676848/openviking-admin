import { Injectable, Inject, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, type FindManyOptions } from 'typeorm';
import { User } from '../../entities/user.entity';
import { IUserRepository } from '../../domain/repositories/user.repository.interface';
import type { RepositoryRequest } from '../../../common/repository-request.interface';

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

  async findAll(tenantId: string | null): Promise<User[]> {
    const where = tenantId ? { tenantId } : {};
    return this.repo.find({ where, order: { createdAt: 'DESC' } });
  }

  async findById(id: string, tenantId?: string | null): Promise<User | null> {
    const where: Record<string, string> = { id };
    if (tenantId) where.tenantId = tenantId;
    return this.repo.findOne({ where });
  }

  async findByUsername(username: string): Promise<User | null> {
    return this.repo.findOne({ where: { username } });
  }

  create(data: Partial<User>): User {
    return this.repo.create(data);
  }

  async save(user: Partial<User>): Promise<User> {
    return this.repo.save(user);
  }

  async delete(id: string): Promise<void> {
    await this.repo.delete(id);
  }

  async find(options?: FindManyOptions<User>): Promise<User[]> {
    return this.repo.find(options ?? {});
  }
}
