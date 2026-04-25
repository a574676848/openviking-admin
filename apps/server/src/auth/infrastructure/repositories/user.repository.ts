import { Injectable, Inject, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, type FindManyOptions } from 'typeorm';
import { User } from '../../../users/entities/user.entity';
import { IUserRepository } from '../../domain/repositories/user.repository.interface';
import type { RepositoryRequest } from '../../../common/repository-request.interface';

@Injectable({ scope: Scope.REQUEST })
export class UserRepository implements IUserRepository {
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

  async findOneByUsername(username: string): Promise<User | null> {
    return this.repo.findOne({ where: { username } });
  }

  async findOneById(id: string): Promise<User | null> {
    return this.repo.findOne({ where: { id } });
  }

  async save(user: Partial<User>): Promise<User> {
    return this.repo.save(user);
  }

  create(user: Partial<User>): User {
    return this.repo.create(user);
  }

  async find(options?: FindManyOptions<User>): Promise<User[]> {
    return this.repo.find(options ?? {});
  }

  async delete(id: string): Promise<void> {
    await this.repo.delete(id);
  }
}
