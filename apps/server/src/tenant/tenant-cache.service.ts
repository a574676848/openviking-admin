import { Injectable, Inject, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
  private cache = new Map<
    string,
    { value: IsolationConfig; expiresAt: number }
  >();

  constructor(
    @Inject(TENANT_REPOSITORY)
    private readonly repo: ITenantRepository,
    @Optional() private readonly config?: ConfigService,
  ) {}

  async getIsolationConfig(tenantId: string) {
    const cached = this.cache.get(tenantId);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    if (cached) this.cache.delete(tenantId);

    const tenant = await this.repo.findByTenantId(tenantId);
    if (!tenant) return null;

    const config: IsolationConfig = {
      tenantId: tenant.tenantId,
      level: tenant.isolationLevel,
      dbConfig: tenant.dbConfig ?? undefined,
    };
    this.cache.set(tenantId, {
      value: config,
      expiresAt: Date.now() + this.resolveCacheTtlMs(),
    });
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

  cleanupExpired(now = Date.now()) {
    let deleted = 0;
    for (const [tenantId, entry] of this.cache.entries()) {
      if (entry.expiresAt > now) {
        continue;
      }
      this.cache.delete(tenantId);
      deleted += 1;
    }
    return deleted;
  }

  private resolveCacheTtlMs() {
    const ttlMs = Number(this.config?.get<string>('TENANT_CACHE_TTL_MS'));
    return Number.isFinite(ttlMs) && ttlMs > 0 ? ttlMs : 10 * 60_000;
  }
}
