import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { KnowledgeNode } from '../knowledge-tree/entities/knowledge-node.entity';
import { ImportTask } from '../import-task/entities/import-task.entity';
import { KnowledgeBase } from '../knowledge-base/entities/knowledge-base.entity';
import { Integration } from '../tenant/entities/integration.entity';
import { DocumentDraft } from '../document/entities/document-draft.entity';

interface DbConfig {
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  database?: string;
}

@Injectable()
export class DynamicDataSourceService implements OnModuleDestroy {
  private readonly logger = new Logger(DynamicDataSourceService.name);
  private pool = new Map<string, DataSource>();
  private readonly lastUsedAt = new Map<string, number>();

  private readonly CORE_ENTITIES = [
    KnowledgeNode,
    ImportTask,
    KnowledgeBase,
    Integration,
    DocumentDraft,
  ];

  async getTenantDataSource(
    tenantId: string,
    dbConfig: DbConfig,
  ): Promise<DataSource> {
    if (this.pool.has(tenantId)) {
      const ds = this.pool.get(tenantId)!;
      if (ds.isInitialized) {
        this.lastUsedAt.set(tenantId, Date.now());
        return ds;
      }
      this.pool.delete(tenantId);
      this.lastUsedAt.delete(tenantId);
    }

    this.logger.log(
      `>> Establishing robust connection for LARGE tenant: ${tenantId}`,
    );

    const ds = new DataSource({
      type: 'postgres',
      host: dbConfig.host,
      port: Number(dbConfig.port) || 5432,
      username: dbConfig.username,
      password: dbConfig.password,
      database: dbConfig.database,
      entities: this.CORE_ENTITIES,
      synchronize: false,
      logging: ['error'],
      extra: {
        max: 10,
        idleTimeoutMillis: 30000,
      },
    });

    try {
      await ds.initialize();
      this.pool.set(tenantId, ds);
      this.lastUsedAt.set(tenantId, Date.now());
      return ds;
    } catch (err) {
      const message = err instanceof Error ? err.message : '未知错误';
      this.logger.error(
        `Failed to connect to LARGE tenant DB [${tenantId}]: ${message}`,
      );
      throw err;
    }
  }

  async onModuleDestroy() {
    for (const ds of this.pool.values()) {
      if (ds.isInitialized) await ds.destroy();
    }
    this.pool.clear();
    this.lastUsedAt.clear();
  }

  async evictIdleTenants(maxIdleMs: number) {
    if (maxIdleMs <= 0) {
      return 0;
    }

    const now = Date.now();
    let evicted = 0;
    for (const [tenantId, ds] of this.pool.entries()) {
      const lastUsedAt = this.lastUsedAt.get(tenantId) ?? 0;
      if (now - lastUsedAt < maxIdleMs) {
        continue;
      }
      this.pool.delete(tenantId);
      this.lastUsedAt.delete(tenantId);
      if (ds.isInitialized) {
        await ds.destroy();
      }
      evicted += 1;
    }
    return evicted;
  }

  getPoolStatus() {
    const tenants = Array.from(this.pool.keys());
    return {
      activeTenants: tenants.length,
      tenantList: tenants,
    };
  }
}
