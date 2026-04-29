import { Injectable, Inject } from '@nestjs/common';
import { TENANT_REPOSITORY } from './domain/repositories/tenant.repository.interface';
import type { ITenantRepository } from './domain/repositories/tenant.repository.interface';

interface IsolationConfig {
  tenantId: string;
  level: string;
  dbConfig?: {
    host?: string;
    port?: number;
    username?: string;
    password?: string;
    database?: string;
  };
}

@Injectable()
export class TenantCacheService {
  private cache = new Map<string, IsolationConfig>();

  constructor(
    @Inject(TENANT_REPOSITORY)
    private readonly repo: ITenantRepository,
  ) {}

  async getIsolationConfig(tenantId: string) {
    if (this.cache.has(tenantId)) return this.cache.get(tenantId);

    const tenant = await this.repo.findByTenantId(tenantId);
    if (!tenant) return null;

    const config: IsolationConfig = {
      tenantId: tenant.tenantId,
      level: tenant.isolationLevel,
      dbConfig: tenant.dbConfig ?? undefined,
    };
    this.cache.set(tenantId, config);
    return config;
  }

  async getIsolationConfigByTenantRecordId(tenantRecordId: string) {
    const tenant =
      (await this.repo.findById(tenantRecordId)) ??
      (await this.repo.findByTenantId(tenantRecordId));
    if (!tenant) return null;

    return this.getIsolationConfig(tenant.tenantId);
  }

  invalidate(tenantId: string) {
    this.cache.delete(tenantId);
  }
}
