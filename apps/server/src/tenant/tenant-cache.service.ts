import { Injectable, Inject } from '@nestjs/common';
import { TENANT_REPOSITORY } from './domain/repositories/tenant.repository.interface';
import type { ITenantRepository } from './domain/repositories/tenant.repository.interface';

interface IsolationConfig {
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
      level: tenant.isolationLevel,
      dbConfig: tenant.dbConfig ?? undefined,
    };
    this.cache.set(tenantId, config);
    return config;
  }

  invalidate(tenantId: string) {
    this.cache.delete(tenantId);
  }
}
