import { Injectable, Inject, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Tenant } from '../../entities/tenant.entity';
import { ITenantRepository } from '../../domain/repositories/tenant.repository.interface';
import type { TenantModel } from '../../domain/tenant.model';

interface TenantRequest {
  tenantQueryRunner?: {
    manager: {
      getRepository: (entity: typeof Tenant) => Repository<Tenant>;
    };
  };
  tenantDataSource?: DataSource;
}

@Injectable({ scope: Scope.REQUEST })
export class TenantRepository implements ITenantRepository {
  constructor(
    @Inject(REQUEST) private readonly request: TenantRequest,
    @InjectRepository(Tenant)
    private readonly defaultRepo: Repository<Tenant>,
  ) {}

  private get repo(): Repository<Tenant> {
    if (this.request?.tenantQueryRunner) {
      return this.request.tenantQueryRunner.manager.getRepository(Tenant);
    }
    if (this.request?.tenantDataSource) {
      return this.request.tenantDataSource.getRepository(Tenant);
    }
    return this.defaultRepo;
  }

  private toModel(entity: Tenant): TenantModel {
    return {
      id: entity.id,
      tenantId: entity.tenantId,
      displayName: entity.displayName,
      status: entity.status,
      isolationLevel: entity.isolationLevel,
      dbConfig: entity.dbConfig,
      vikingAccount: entity.vikingAccount,
      quota: entity.quota,
      ovConfig: entity.ovConfig,
      description: entity.description,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }

  private toEntityInput(tenant: Partial<TenantModel>): Partial<Tenant> {
    return {
      id: tenant.id,
      tenantId: tenant.tenantId,
      displayName: tenant.displayName,
      status: tenant.status,
      isolationLevel: tenant.isolationLevel,
      dbConfig: tenant.dbConfig ?? undefined,
      vikingAccount: tenant.vikingAccount ?? undefined,
      quota: tenant.quota ?? undefined,
      ovConfig: tenant.ovConfig ?? undefined,
      description: tenant.description ?? undefined,
      createdAt: tenant.createdAt,
      updatedAt: tenant.updatedAt,
    };
  }

  async findAll(): Promise<TenantModel[]> {
    const items = await this.repo.find({ order: { createdAt: 'DESC' } });
    return items.map((item) => this.toModel(item));
  }

  async findById(id: string): Promise<TenantModel | null> {
    const item = await this.repo.findOne({ where: { id } });
    return item ? this.toModel(item) : null;
  }

  async findByTenantId(tenantId: string): Promise<TenantModel | null> {
    const item = await this.repo.findOne({ where: { tenantId } });
    return item ? this.toModel(item) : null;
  }

  create(data: Partial<TenantModel>): TenantModel {
    return this.toModel(this.repo.create(this.toEntityInput(data)));
  }

  async save(tenant: TenantModel): Promise<TenantModel> {
    const saved = await this.repo.save(this.toEntityInput(tenant));
    return this.toModel(saved);
  }

  async update(id: string, data: Partial<TenantModel>): Promise<void> {
    await this.repo.update(id, this.toEntityInput(data) as never);
  }

  async delete(id: string): Promise<void> {
    await this.repo.delete(id);
  }
}
