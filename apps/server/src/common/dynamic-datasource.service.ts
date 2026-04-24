import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { DataSource, DataSourceOptions } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { Tenant } from '../tenant/entities/tenant.entity';
import { KnowledgeNode } from '../knowledge-tree/entities/knowledge-node.entity';
import { SearchLog } from '../search/entities/search-log.entity';
import { ImportTask } from '../import-task/entities/import-task.entity';
import { KnowledgeBase } from '../knowledge-base/entities/knowledge-base.entity';
import { Integration } from '../tenant/entities/integration.entity';

@Injectable()
export class DynamicDataSourceService implements OnModuleDestroy {
  private readonly logger = new Logger(DynamicDataSourceService.name);
  private pool = new Map<string, DataSource>();

  /**
   * 生产级：显式声明业务实体清单
   * 避免使用不稳定的 glob 物理路径扫描
   */
  private readonly CORE_ENTITIES = [
    User,
    Tenant,
    KnowledgeNode,
    SearchLog,
    ImportTask,
    KnowledgeBase,
    Integration,
  ];

  async getTenantDataSource(
    tenantId: string,
    dbConfig: any,
  ): Promise<DataSource> {
    if (this.pool.has(tenantId)) {
      const ds = this.pool.get(tenantId)!;
      if (ds.isInitialized) return ds;
      this.pool.delete(tenantId);
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
      entities: this.CORE_ENTITIES, // 显式引用，严禁硬编码路径
      synchronize: false,
      logging: ['error'],
      extra: {
        max: 10, // 连接池限制
        idleTimeoutMillis: 30000,
      },
    });

    try {
      await ds.initialize();
      this.pool.set(tenantId, ds);
      return ds;
    } catch (err) {
      this.logger.error(
        `Failed to connect to LARGE tenant DB [${tenantId}]: ${err.message}`,
      );
      throw err;
    }
  }

  async onModuleDestroy() {
    for (const ds of this.pool.values()) {
      if (ds.isInitialized) await ds.destroy();
    }
  }

  getPoolStatus() {
    const tenants = Array.from(this.pool.keys());
    return {
      activeTenants: tenants.length,
      tenantList: tenants,
    };
  }
}
