import { Injectable, Inject, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Repository,
  DataSource,
  type FindManyOptions,
  type FindOneOptions,
} from 'typeorm';
import { Integration } from '../../entities/integration.entity';
import { IIntegrationRepository } from '../../domain/repositories/integration.repository.interface';
import type { IntegrationModel } from '../../domain/integration.model';
import type {
  RepositoryFindOneQuery,
  RepositoryFindQuery,
} from '../../../common/repository-query.types';

interface TenantRequest {
  tenantQueryRunner?: {
    manager: {
      getRepository: (entity: typeof Integration) => Repository<Integration>;
    };
  };
  tenantDataSource?: DataSource;
}

@Injectable({ scope: Scope.REQUEST })
export class IntegrationRepositoryImpl implements IIntegrationRepository {
  constructor(
    @Inject(REQUEST) private readonly request: TenantRequest,
    @InjectRepository(Integration)
    private readonly defaultRepo: Repository<Integration>,
  ) {}

  private get repo(): Repository<Integration> {
    if (this.request?.tenantQueryRunner) {
      return this.request.tenantQueryRunner.manager.getRepository(Integration);
    }
    if (this.request?.tenantDataSource) {
      return this.request.tenantDataSource.getRepository(Integration);
    }
    return this.defaultRepo;
  }

  private toModel(entity: Integration): IntegrationModel {
    return {
      id: entity.id,
      tenantId: entity.tenantId,
      name: entity.name,
      type: entity.type,
      credentials: entity.credentials,
      config: entity.config,
      active: entity.active,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }

  private toEntityInput(
    integration: Partial<IntegrationModel>,
  ): Partial<Integration> {
    return {
      id: integration.id,
      tenantId: integration.tenantId,
      name: integration.name,
      type: integration.type,
      credentials: integration.credentials,
      config: integration.config ?? undefined,
      active: integration.active,
      createdAt: integration.createdAt,
      updatedAt: integration.updatedAt,
    };
  }

  async find(
    options: RepositoryFindQuery<IntegrationModel>,
  ): Promise<IntegrationModel[]> {
    const items = await this.repo.find(options as FindManyOptions<Integration>);
    return items.map((item) => this.toModel(item));
  }

  async findOne(
    options: RepositoryFindOneQuery<IntegrationModel>,
  ): Promise<IntegrationModel | null> {
    const item = await this.repo.findOne(options as FindOneOptions<Integration>);
    return item ? this.toModel(item) : null;
  }

  async save(
    integration: Partial<IntegrationModel>,
  ): Promise<IntegrationModel> {
    if (integration.id) {
      const existing = await this.repo.findOne({
        where: { id: integration.id },
      });
      if (existing) {
        const saved = await this.repo.save({
          ...existing,
          ...this.toEntityInput(integration),
        });
        return this.toModel(saved);
      }
    }
    const saved = await this.repo.save(
      this.repo.create(this.toEntityInput(integration)),
    );
    return this.toModel(saved);
  }

  async remove(integration: IntegrationModel): Promise<IntegrationModel> {
    const removed = await this.repo.remove(
      this.repo.create(this.toEntityInput(integration)),
    );
    return this.toModel(removed);
  }
}
