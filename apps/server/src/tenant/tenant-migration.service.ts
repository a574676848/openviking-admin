import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { TenantIsolationLevel } from '../common/constants/system.enum';
import { AuditService } from '../audit/audit.service';
import { DynamicDataSourceService } from '../common/dynamic-datasource.service';
import { SchemaInitializerService } from './schema-initializer.service';
import { TenantCacheService } from './tenant-cache.service';
import { TenantService } from './tenant.service';
import { Tenant } from './entities/tenant.entity';
import {
  TenantMigrationTask,
  type TenantMigrationTaskStatus,
} from './entities/tenant-migration-task.entity';
import type { TenantMigrationRequestDto } from './dto/tenant-migration.dto';
import type { TenantModel } from './domain/tenant.model';

interface AdminContext {
  id: string;
  username: string;
}

interface DbConfig {
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  database?: string;
}

type PlatformMigrationSummary = {
  pending: boolean;
};

interface StorageLocation {
  dataSource: DataSource;
  schema: string;
  release: boolean;
}

export interface PrecheckItem {
  name: string;
  passed: boolean;
  message: string;
}

const MIGRATION_TABLES = [
  'knowledge_bases',
  'knowledge_nodes',
  'import_tasks',
  'integrations',
  'document_drafts',
] as const;
const TENANT_SCHEMA_PREFIX = 'tenant_';
const DEFAULT_DB_PORT = 5432;
const DEFAULT_DB_USER = 'postgres';
const DEFAULT_ADMIN_DATABASE_NAME = 'postgres';
const TASK_LIST_LIMIT = 50;
const TASK_PROGRESS = {
  READY: 10,
  STORAGE_READY: 30,
  COPYING_START: 45,
  COPYING_DONE: 80,
  ROUTED: 95,
  DONE: 100,
} as const;

@Injectable()
export class TenantMigrationService {
  private readonly logger = new Logger(TenantMigrationService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly schemaInitializer: SchemaInitializerService,
    private readonly dynamicDS: DynamicDataSourceService,
    private readonly tenantCache: TenantCacheService,
    private readonly auditService: AuditService,
    private readonly tenantService: TenantService,
    @InjectRepository(TenantMigrationTask)
    private readonly taskRepo: Repository<TenantMigrationTask>,
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
  ) {}

  async findTenants() {
    return this.tenantRepo.find({ order: { createdAt: 'DESC' } });
  }

  async findTasks() {
    return this.taskRepo.find({
      order: { createdAt: 'DESC' },
      take: TASK_LIST_LIMIT,
    });
  }

  async findTask(id: string) {
    const task = await this.taskRepo.findOne({ where: { id } });
    if (!task) {
      throw new NotFoundException(`迁移任务 ${id} 不存在`);
    }
    return task;
  }

  async precheck(dto: TenantMigrationRequestDto) {
    return this.precheckTenant(dto);
  }

  async precheckTenant(dto: TenantMigrationRequestDto) {
    const tenant = await this.findTenant(dto.tenantId);
    const targetLevel = tenant.isolationLevel;
    const targetDbConfig = this.resolveTenantDbConfig(tenant.dbConfig ?? null);
    const items: PrecheckItem[] = [
      {
        name: '租户存在',
        passed: true,
        message: `已找到租户 ${tenant.displayName}。`,
      },
      {
        name: '配置规格',
        passed: true,
        message: `将按租户当前配置规格 ${targetLevel} 执行存储结构迁移。`,
      },
    ];

    if (targetLevel === TenantIsolationLevel.LARGE) {
      items.push(await this.precheckLargeDatabase(targetDbConfig));
    }

    if (targetLevel === TenantIsolationLevel.MEDIUM) {
      items.push(await this.precheckMediumSchemaPrivilege());
    }

    const passed = items.every((item) => item.passed);
    return {
      passed,
      tenant: this.toTenantSummary(tenant),
      sourceLevel: tenant.isolationLevel,
      targetLevel,
      items,
    };
  }

  async precheckPlatform() {
    const migrationSummary = await this.resolvePlatformMigrationSummary();
    const items: PrecheckItem[] = [
      {
        name: '控制库连接',
        passed: true,
        message: '平台公共库连接正常。',
      },
      {
        name: '待执行 migration',
        passed: migrationSummary.pending,
        message: migrationSummary.pending
          ? '检测到待执行的 TypeORM migration。'
          : '当前没有待执行的 TypeORM migration。',
      },
    ];

    return {
      passed: items.every((item) => item.passed),
      scope: 'platform',
      items,
    };
  }

  async createTask(dto: TenantMigrationRequestDto, adminContext: AdminContext) {
    return this.createTenantTask(dto, adminContext);
  }

  async createTenantTask(
    dto: TenantMigrationRequestDto,
    adminContext: AdminContext,
  ) {
    const precheckResult = await this.precheckTenant(dto);
    if (!precheckResult.passed) {
      throw new BadRequestException('迁移预检未通过，请修复后重试。');
    }

    const tenant = await this.findTenant(dto.tenantId);
    const task = await this.taskRepo.save(
      this.taskRepo.create({
        scope: 'tenant',
        tenantRecordId: tenant.id,
        tenantId: tenant.tenantId,
        sourceLevel: tenant.isolationLevel,
        targetLevel: tenant.isolationLevel,
        status: 'pending',
        step: '等待执行',
        progress: 0,
        targetDbConfig:
          tenant.isolationLevel === TenantIsolationLevel.LARGE
            ? this.resolveTenantDbConfig(tenant.dbConfig ?? null)
            : null,
        precheckResult,
        createdById: adminContext.id,
        createdByName: adminContext.username,
      }),
    );

    setTimeout(() => {
      void this.executeTask(task.id, adminContext);
    }, 0);

    return task;
  }

  async createPlatformTask(adminContext: AdminContext) {
    const precheckResult = await this.precheckPlatform();
    if (!precheckResult.passed) {
      throw new BadRequestException('平台公共表迁移预检未通过。');
    }

    const task = await this.taskRepo.save(
      this.taskRepo.create({
        scope: 'platform',
        tenantRecordId: null,
        tenantId: null,
        sourceLevel: null,
        targetLevel: null,
        status: 'pending',
        step: '等待执行',
        progress: 0,
        targetDbConfig: null,
        precheckResult,
        createdById: adminContext.id,
        createdByName: adminContext.username,
      }),
    );

    setTimeout(() => {
      void this.executePlatformTask(task.id, adminContext);
    }, 0);

    return task;
  }

  private async executeTask(taskId: string, adminContext: AdminContext) {
    const task = await this.findTask(taskId);
    if (task.scope === 'platform') {
      await this.executePlatformTask(taskId, adminContext);
      return;
    }

    if (!task.tenantRecordId || !task.targetLevel) {
      throw new Error(`租户迁移任务 ${task.id} 缺少租户或规格信息。`);
    }

    const tenant = await this.findTenant(task.tenantRecordId);
    try {
      await this.updateTask(task.id, 'running', '准备目标存储', TASK_PROGRESS.READY);
      await this.schemaInitializer.initialize({
        tenantId: tenant.tenantId,
        isolationLevel: task.targetLevel,
        dbConfig: task.targetDbConfig ?? undefined,
      });

      await this.updateTask(
        task.id,
        'running',
        '目标存储已就绪',
        TASK_PROGRESS.STORAGE_READY,
      );

      const source = await this.resolveStorageLocation(
        tenant.tenantId,
        task.sourceLevel ?? task.targetLevel,
        tenant.dbConfig ?? undefined,
      );
      const target = await this.resolveStorageLocation(
        tenant.tenantId,
        task.targetLevel,
        task.targetDbConfig ?? undefined,
      );

      try {
        await this.updateTask(
          task.id,
          'running',
          '复制租户业务数据',
          TASK_PROGRESS.COPYING_START,
        );
        await this.copyTenantData(tenant.tenantId, source, target);
      } finally {
        await this.releaseStorageLocation(source);
        await this.releaseStorageLocation(target);
      }

      await this.updateTask(
        task.id,
        'running',
        '刷新租户数据库路由',
        TASK_PROGRESS.COPYING_DONE,
      );
      await this.tenantRepo.update(tenant.id, {
        isolationLevel: task.targetLevel,
        dbConfig:
          task.targetLevel === TenantIsolationLevel.LARGE
            ? task.targetDbConfig
            : null,
      });
      this.tenantCache.invalidate(tenant.tenantId);

      await this.auditService.log({
        tenantId: undefined,
        userId: adminContext.id,
        username: adminContext.username,
        action: 'migrate_tenant_database',
        target: tenant.tenantId,
        meta: {
          taskId: task.id,
          from: task.sourceLevel ?? task.targetLevel,
          to: task.targetLevel,
        },
      });

      await this.updateTask(task.id, 'succeeded', '迁移完成', TASK_PROGRESS.DONE);
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      this.logger.error(`租户 ${task.tenantId} 数据库迁移失败：${message}`);
      await this.taskRepo.update(task.id, {
        status: 'failed',
        step: '迁移失败',
        errorMessage: message,
      });
    }
  }

  private async executePlatformTask(
    taskId: string,
    adminContext: AdminContext,
  ) {
    const task = await this.findTask(taskId);
    try {
      await this.updateTask(task.id, 'running', '执行平台公共表 migration', TASK_PROGRESS.READY);
      const migrations = await this.dataSource.runMigrations({
        transaction: 'all',
      });
      await this.auditService.log({
        tenantId: undefined,
        userId: adminContext.id,
        username: adminContext.username,
        action: 'migrate_platform_database',
        target: 'platform',
        meta: {
          taskId: task.id,
          migrations: migrations.map((migration) => migration.name),
        },
      });
      await this.updateTask(task.id, 'succeeded', '平台公共表迁移完成', TASK_PROGRESS.DONE);
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      this.logger.error(`平台公共表迁移失败：${message}`);
      await this.taskRepo.update(task.id, {
        status: 'failed',
        step: '迁移失败',
        errorMessage: message,
      });
    }
  }

  private async findTenant(identifier: string) {
    return this.tenantService.findOneByIdOrTenantId(identifier);
  }

  private async precheckLargeDatabase(dbConfig: DbConfig): Promise<PrecheckItem> {
    if (!dbConfig.database) {
      return {
        name: '独立数据库配置',
        passed: false,
        message: 'LARGE 规格必须填写目标数据库名。',
      };
    }

    const adminDataSource = new DataSource({
      type: 'postgres',
      host: dbConfig.host,
      port: Number(dbConfig.port) || DEFAULT_DB_PORT,
      username: dbConfig.username,
      password: dbConfig.password,
      database: DEFAULT_ADMIN_DATABASE_NAME,
      synchronize: false,
      logging: false,
    });

    try {
      await adminDataSource.initialize();
      await adminDataSource.query('SELECT 1');
      return {
        name: '独立数据库连接',
        passed: true,
        message: '目标 PostgreSQL 实例连接正常。',
      };
    } catch (error) {
      return {
        name: '独立数据库连接',
        passed: false,
        message: error instanceof Error ? error.message : '连接失败。',
      };
    } finally {
      if (adminDataSource.isInitialized) {
        await adminDataSource.destroy();
      }
    }
  }

  private async precheckMediumSchemaPrivilege(): Promise<PrecheckItem> {
    try {
      const result = await this.dataSource.query(
        `SELECT has_database_privilege(current_database(), 'CREATE') AS "canCreate"`,
      );
      const canCreate = result[0]?.canCreate === true;
      return {
        name: 'Schema 创建权限',
        passed: canCreate,
        message: canCreate
          ? '控制库账号具备创建租户 Schema 的权限。'
          : '控制库账号缺少 CREATE 权限。',
      };
    } catch (error) {
      return {
        name: 'Schema 创建权限',
        passed: false,
        message: error instanceof Error ? error.message : '权限检查失败。',
      };
    }
  }

  private resolveTenantDbConfig(dbConfig?: DbConfig | null): DbConfig {
    return {
      host: dbConfig?.host ?? this.configService.get<string>('DB_HOST'),
      port:
        Number(dbConfig?.port ?? this.configService.get<number>('DB_PORT')) ||
        DEFAULT_DB_PORT,
      username:
        dbConfig?.username ??
        this.configService.get<string>('DB_USER', DEFAULT_DB_USER),
      password: dbConfig?.password ?? this.configService.get<string>('DB_PASS'),
      database: dbConfig?.database,
    };
  }

  private async resolvePlatformMigrationSummary(): Promise<PlatformMigrationSummary> {
    return {
      pending: await this.dataSource.showMigrations(),
    };
  }

  private async resolveStorageLocation(
    tenantId: string,
    level: TenantIsolationLevel,
    dbConfig?: DbConfig,
  ): Promise<StorageLocation> {
    if (level === TenantIsolationLevel.LARGE) {
      if (!dbConfig?.database) {
        throw new Error(`LARGE 租户 ${tenantId} 缺少目标数据库配置。`);
      }
      return {
        dataSource: await this.dynamicDS.getTenantDataSource(tenantId, dbConfig),
        schema: 'public',
        release: false,
      };
    }

    return {
      dataSource: this.dataSource,
      schema:
        level === TenantIsolationLevel.MEDIUM
          ? this.resolveTenantSchemaName(tenantId)
          : 'public',
      release: false,
    };
  }

  private async copyTenantData(
    tenantId: string,
    source: StorageLocation,
    target: StorageLocation,
  ) {
    for (const table of MIGRATION_TABLES) {
      if (
        !(await this.tableExists(source.dataSource, source.schema, table)) ||
        !(await this.tableExists(target.dataSource, target.schema, table))
      ) {
        continue;
      }

      const columns = await this.resolveSharedColumns(source, target, table);
      if (columns.length === 0) {
        continue;
      }

      const rows = await this.readTenantRows(source, table, columns, tenantId);
      await this.replaceRows(target, table, columns, rows);
    }
  }

  private async resolveSharedColumns(
    source: StorageLocation,
    target: StorageLocation,
    table: string,
  ) {
    const [sourceColumns, targetColumns] = await Promise.all([
      this.listColumns(source.dataSource, source.schema, table),
      this.listColumns(target.dataSource, target.schema, table),
    ]);
    const targetSet = new Set(targetColumns);
    return sourceColumns.filter((column) => targetSet.has(column));
  }

  private async readTenantRows(
    source: StorageLocation,
    table: string,
    columns: string[],
    tenantId: string,
  ) {
    const hasTenantId = columns.includes('tenant_id');
    const sql = `
      SELECT ${columns.map((column) => this.quoteIdentifier(column)).join(', ')}
      FROM ${this.tableName(source.schema, table)}
      ${hasTenantId ? 'WHERE "tenant_id" = $1' : ''}
    `;
    return source.dataSource.query(sql, hasTenantId ? [tenantId] : []);
  }

  private async replaceRows(
    target: StorageLocation,
    table: string,
    columns: string[],
    rows: Record<string, unknown>[],
  ) {
    if (rows.length === 0) {
      return;
    }

    const columnSql = columns.map((column) => this.quoteIdentifier(column)).join(', ');
    const valueSql = columns.map((_, index) => `$${index + 1}`).join(', ');
    const updateColumns = columns.filter((column) => column !== 'id');
    const updateSql = updateColumns
      .map(
        (column) =>
          `${this.quoteIdentifier(column)} = EXCLUDED.${this.quoteIdentifier(column)}`,
      )
      .join(', ');
    const sql = `
      INSERT INTO ${this.tableName(target.schema, table)} (${columnSql})
      VALUES (${valueSql})
      ON CONFLICT ("id") DO UPDATE SET ${updateSql}
    `;

    const queryRunner = target.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      for (const row of rows) {
        await queryRunner.query(
          sql,
          columns.map((column) => row[column]),
        );
      }
      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private async listColumns(
    dataSource: DataSource,
    schema: string,
    table: string,
  ): Promise<string[]> {
    const rows = await dataSource.query(
      `
        SELECT column_name AS "columnName"
        FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = $2
        ORDER BY ordinal_position
      `,
      [schema, table],
    );
    return rows.map((row: { columnName: string }) => row.columnName);
  }

  private async tableExists(dataSource: DataSource, schema: string, table: string) {
    const rows = await dataSource.query(
      `
        SELECT EXISTS (
          SELECT 1
          FROM information_schema.tables
          WHERE table_schema = $1 AND table_name = $2
        ) AS "exists"
      `,
      [schema, table],
    );
    return rows[0]?.exists === true;
  }

  private async updateTask(
    id: string,
    status: TenantMigrationTaskStatus,
    step: string,
    progress: number,
  ) {
    await this.taskRepo.update(id, { status, step, progress });
  }

  private async releaseStorageLocation(location: StorageLocation) {
    if (location.release && location.dataSource.isInitialized) {
      await location.dataSource.destroy();
    }
  }

  private resolveTenantSchemaName(tenantId: string) {
    return `${TENANT_SCHEMA_PREFIX}${tenantId.replace(/-/g, '_')}`;
  }

  private tableName(schema: string, table: string) {
    return `${this.quoteIdentifier(schema)}.${this.quoteIdentifier(table)}`;
  }

  private quoteIdentifier(identifier: string) {
    return `"${identifier.replace(/"/g, '""')}"`;
  }

  private toTenantSummary(tenant: TenantModel) {
    return {
      id: tenant.id,
      tenantId: tenant.tenantId,
      displayName: tenant.displayName,
      status: tenant.status,
      isolationLevel: tenant.isolationLevel,
    };
  }
}
