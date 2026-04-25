import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TenantIsolationLevel } from '../common/constants/system.enum';
import { DynamicDataSourceService } from '../common/dynamic-datasource.service';

interface DbConfig {
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  database?: string;
}

interface TenantInitParams {
  tenantId: string;
  isolationLevel: TenantIsolationLevel;
  dbConfig?: DbConfig;
}

@Injectable()
export class SchemaInitializerService {
  private readonly logger = new Logger(SchemaInitializerService.name);

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

  async initialize(tenant: TenantInitParams) {
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

  private async runSchemaDDL(tenantId: string) {
    const schemaName = `tenant_${tenantId.replace(/-/g, '_')}`;
    const queryRunner = this.mainDataSource.createQueryRunner();

    try {
      await queryRunner.connect();
      await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);

      for (const table of this.CORE_BUSINESS_TABLES) {
        await queryRunner.query(`
          CREATE TABLE IF NOT EXISTS "${schemaName}"."${table}"
          (LIKE public."${table}" INCLUDING ALL)
        `);
      }
    } finally {
      await queryRunner.release();
    }
  }

  private async runExternalDBInitialization(
    tenantId: string,
    dbConfig?: DbConfig,
  ) {
    if (!dbConfig)
      throw new Error(
        `CRITICAL: Missing configuration for LARGE tenant [${tenantId}]`,
      );

    const ds = await this.dynamicDS.getTenantDataSource(tenantId, dbConfig);

    try {
      this.logger.log(
        `-- Executing full schema synchronization on target: ${dbConfig.host}`,
      );
      await ds.synchronize(false);
      this.logger.log(
        `<< External database [${dbConfig.database}] is now production-ready.`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : '未知错误';
      this.logger.error(`Failed to synchronize external DB: ${message}`);
      throw err;
    }
  }
}
