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

const DEFAULT_ADMIN_DATABASE_NAME = 'postgres';
const UUID_EXTENSION_SQL = 'CREATE EXTENSION IF NOT EXISTS "uuid-ossp"';

@Injectable()
export class SchemaInitializerService {
  private readonly logger = new Logger(SchemaInitializerService.name);

  private readonly CORE_BUSINESS_TABLES = [
    'knowledge_bases',
    'knowledge_nodes',
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
    } catch (error) {
      await queryRunner.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      throw error;
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

    const createdDatabase = await this.ensureDatabaseExists(dbConfig);
    const ds = await this.dynamicDS.getTenantDataSource(tenantId, dbConfig);

    try {
      await ds.query(UUID_EXTENSION_SQL);
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
      if (createdDatabase) {
        await this.dropDatabaseIfExists(dbConfig);
      }
      throw err;
    }
  }

  private async ensureDatabaseExists(dbConfig: DbConfig): Promise<boolean> {
    const databaseName = dbConfig.database?.trim();
    if (!databaseName) {
      throw new Error('LARGE 租户缺少独立数据库名，无法完成初始化。');
    }

    const adminDataSource = new DataSource({
      type: 'postgres',
      host: dbConfig.host,
      port: Number(dbConfig.port) || 5432,
      username: dbConfig.username,
      password: dbConfig.password,
      database: DEFAULT_ADMIN_DATABASE_NAME,
      synchronize: false,
      logging: false,
    });

    try {
      await adminDataSource.initialize();
      const existingDatabases = await adminDataSource.query(
        'SELECT 1 FROM pg_database WHERE datname = $1',
        [databaseName],
      );

      if (existingDatabases.length > 0) {
        return false;
      }

      await adminDataSource.query(
        `CREATE DATABASE ${this.quoteIdentifier(databaseName)}`,
      );
      return true;
    } finally {
      if (adminDataSource.isInitialized) {
        await adminDataSource.destroy();
      }
    }
  }

  private async dropDatabaseIfExists(dbConfig: DbConfig): Promise<void> {
    const databaseName = dbConfig.database?.trim();
    if (!databaseName) {
      return;
    }

    const adminDataSource = new DataSource({
      type: 'postgres',
      host: dbConfig.host,
      port: Number(dbConfig.port) || 5432,
      username: dbConfig.username,
      password: dbConfig.password,
      database: DEFAULT_ADMIN_DATABASE_NAME,
      synchronize: false,
      logging: false,
    });

    try {
      await adminDataSource.initialize();
      await adminDataSource.query(
        `
          SELECT pg_terminate_backend(pid)
          FROM pg_stat_activity
          WHERE datname = $1
            AND pid <> pg_backend_pid()
        `,
        [databaseName],
      );
      await adminDataSource.query(
        `DROP DATABASE IF EXISTS ${this.quoteIdentifier(databaseName)}`,
      );
    } finally {
      if (adminDataSource.isInitialized) {
        await adminDataSource.destroy();
      }
    }
  }

  private quoteIdentifier(identifier: string): string {
    return `"${identifier.replace(/"/g, '""')}"`;
  }
}
