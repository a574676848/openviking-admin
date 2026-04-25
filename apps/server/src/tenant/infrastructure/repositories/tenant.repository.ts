import { Injectable, Inject, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Tenant } from '../../entities/tenant.entity';
import { ITenantRepository } from '../../domain/repositories/tenant.repository.interface';

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

  async findAll(): Promise<Tenant[]> {
    return this.repo.find({ order: { createdAt: 'DESC' } });
  }

  async findById(id: string): Promise<Tenant | null> {
    return this.repo.findOne({ where: { id } });
  }

  async findByTenantId(tenantId: string): Promise<Tenant | null> {
    return this.repo.findOne({ where: { tenantId } });
  }

  create(data: Partial<Tenant>): Tenant {
    return this.repo.create(data);
  }

  async save(tenant: Tenant): Promise<Tenant> {
    return this.repo.save(tenant);
  }

  async update(id: string, data: Partial<Tenant>): Promise<void> {
    await this.repo.update(id, data);
  }

  async delete(id: string): Promise<void> {
    await this.repo.delete(id);
  }
}
