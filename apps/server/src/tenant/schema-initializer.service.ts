import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TenantIsolationLevel } from '../common/constants/system.enum';
import { DynamicDataSourceService } from '../common/dynamic-datasource.service';

@Injectable()
export class SchemaInitializerService {
  private readonly logger = new Logger(SchemaInitializerService.name);

  /**
   * 需要执行 Schema 级物理隔离的业务表清单
   */
  private readonly CORE_BUSINESS_TABLES = [
    'knowledge_bases',
    'knowledge_nodes',
    'search_logs',
    'import_tasks',
    'integrations',
  ];

  constructor(
    private mainDataSource: DataSource,
    private dynamicDS: DynamicDataSourceService,
  ) {}

  /**
   * 生产化初始化：拒绝简化，实现全量 DDL 同步
   */
  async initialize(tenant: {
    tenantId: string;
    isolationLevel: TenantIsolationLevel;
    dbConfig?: any;
  }) {
    this.logger.log(
      `>> Deploying infrastructure: [${tenant.tenantId}] @ [${tenant.isolationLevel}]`,
    );

    switch (tenant.isolationLevel) {
      case TenantIsolationLevel.SMALL:
        return;

      case TenantIsolationLevel.MEDIUM:
        await this.runSchemaDDL(tenant.tenantId);
        break;

      case TenantIsolationLevel.LARGE:
        await this.runExternalDBInitialization(
          tenant.tenantId,
          tenant.dbConfig,
        );
        break;
    }
  }

  /**
   * MEDIUM: 在主库创建 Schema 并克隆表结构
   */
  private async runSchemaDDL(tenantId: string) {
    const schemaName = `tenant_${tenantId.replace(/-/g, '_')}`;
    const queryRunner = this.mainDataSource.createQueryRunner();

    try {
      await queryRunner.connect();
      await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);

      for (const table of this.CORE_BUSINESS_TABLES) {
        // INCLUDING ALL 确保索引、外键、约束全部同步
        await queryRunner.query(`
          CREATE TABLE IF NOT EXISTS "${schemaName}"."${table}" 
          (LIKE public."${table}" INCLUDING ALL)
        `);
      }
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * LARGE: 连接外部独立库，并利用 TypeORM 元数据执行自动化同步
   * 彻底解决字段缺失和手工脚本维护问题
   */
  private async runExternalDBInitialization(tenantId: string, dbConfig: any) {
    if (!dbConfig)
      throw new Error(
        `CRITICAL: Missing configuration for LARGE tenant [${tenantId}]`,
      );

    // 1. 动态建立连接 (DynamicDataSourceService 内部已绑定实体清单)
    const ds = await this.dynamicDS.getTenantDataSource(tenantId, dbConfig);

    try {
      this.logger.log(
        `-- Executing full schema synchronization on target: ${dbConfig.host}`,
      );
      // 2. 利用 TypeORM 底层能力，自动检测并创建所有业务表、索引、关联关系
      // 这是真正的生产级“零维护”同步方案
      await ds.synchronize(false);
      this.logger.log(
        `<< External database [${dbConfig.database}] is now production-ready.`,
      );
    } catch (err) {
      this.logger.error(`Failed to synchronize external DB: ${err.message}`);
      throw err;
    }
  }
}
