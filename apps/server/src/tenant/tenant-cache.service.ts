import { Injectable, Inject } from '@nestjs/common';
import { TENANT_REPOSITORY } from './domain/repositories/tenant.repository.interface';
import type { ITenantRepository } from './domain/repositories/tenant.repository.interface';

@Injectable()
export class TenantCacheService {
  private cache = new Map<string, { level: string; dbConfig?: any }>();

  constructor(
    @Inject(TENANT_REPOSITORY)
    private readonly repo: ITenantRepository,
  ) {}

  async getIsolationConfig(tenantId: string) {
    if (this.cache.has(tenantId)) return this.cache.get(tenantId);

    const tenant = await this.repo.findByTenantId(tenantId);
    if (!tenant) return null;

    const config = { level: tenant.isolationLevel, dbConfig: tenant.dbConfig };
    this.cache.set(tenantId, config);
    return config;
  }

  /** 当租户配置更新时清除缓存 */
  invalidate(tenantId: string) {
    this.cache.delete(tenantId);
  }
}
