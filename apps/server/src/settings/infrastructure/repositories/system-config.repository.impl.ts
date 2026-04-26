import { Injectable, Inject, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, type FindManyOptions, type FindOneOptions } from 'typeorm';
import { SystemConfig } from '../../entities/system-config.entity';
import { ISystemConfigRepository } from '../../domain/repositories/system-config.repository.interface';
import type { SystemConfigModel } from '../../domain/system-config.model';
import type { RepositoryRequest } from '../../../common/repository-request.interface';
import type {
  RepositoryFindOneQuery,
  RepositoryFindQuery,
} from '../../../common/repository-query.types';

@Injectable({ scope: Scope.REQUEST })
export class SystemConfigRepositoryImpl implements ISystemConfigRepository {
  constructor(
    @Inject(REQUEST) private readonly request: RepositoryRequest,
    @InjectRepository(SystemConfig)
    private readonly defaultRepo: Repository<SystemConfig>,
  ) {}

  private get repo(): Repository<SystemConfig> {
    if (this.request?.tenantQueryRunner) {
      return this.request.tenantQueryRunner.manager.getRepository(SystemConfig);
    }
    if (this.request?.tenantDataSource) {
      return this.request.tenantDataSource.getRepository(SystemConfig);
    }
    return this.defaultRepo;
  }

  private toModel(entity: SystemConfig): SystemConfigModel {
    return {
      key: entity.key,
      value: entity.value,
      description: entity.description,
      updatedAt: entity.updatedAt,
    };
  }

  private toEntityInput(
    config: Partial<SystemConfigModel>,
  ): Partial<SystemConfig> {
    return {
      key: config.key,
      value: config.value,
      description: config.description ?? undefined,
      updatedAt: config.updatedAt,
    };
  }

  async find(
    options?: RepositoryFindQuery<SystemConfigModel>,
  ): Promise<SystemConfigModel[]> {
    const items = await this.repo.find((options ?? {}) as FindManyOptions<SystemConfig>);
    return items.map((item) => this.toModel(item));
  }

  async findOne(
    options: RepositoryFindOneQuery<SystemConfigModel>,
  ): Promise<SystemConfigModel | null> {
    const item = await this.repo.findOne(options as FindOneOptions<SystemConfig>);
    return item ? this.toModel(item) : null;
  }

  async save(
    config: Partial<SystemConfigModel>,
  ): Promise<SystemConfigModel> {
    if (config.key) {
      const existing = await this.repo.findOne({ where: { key: config.key } });
      if (existing) {
        const saved = await this.repo.save({
          ...existing,
          ...this.toEntityInput(config),
        });
        return this.toModel(saved);
      }
    }
    const saved = await this.repo.save(
      this.repo.create(this.toEntityInput(config)),
    );
    return this.toModel(saved);
  }
}
