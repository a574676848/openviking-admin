import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
  Logger,
} from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { APP_INTERCEPTOR, APP_FILTER } from '@nestjs/core';
import { DataSource, type DataSourceOptions } from 'typeorm';
import { AuthModule } from './auth/auth.module';
import { KnowledgeBaseModule } from './knowledge-base/knowledge-base.module';
import { KnowledgeTreeModule } from './knowledge-tree/knowledge-tree.module';
import { ImportTaskModule } from './import-task/import-task.module';
import { SearchModule } from './search/search.module';
import { SystemModule } from './system/system.module';
import { UsersModule } from './users/users.module';
import { TenantModule } from './tenant/tenant.module';
import { SettingsModule } from './settings/settings.module';
import { AuditModule } from './audit/audit.module';
import { CommonModule } from './common/common.module';
import { CapabilitiesModule } from './capabilities/capabilities.module';
import { McpModule } from './mcp/mcp.module';
import { TenantCleanupInterceptor } from './common/tenant-cleanup.interceptor';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { SuccessResponseInterceptor } from './common/success-response.interceptor';
import { RequestTraceMiddleware } from './common/request-trace.middleware';

const DEV_AUTO_MIGRATION_LOGGER = new Logger('TypeOrmDevMigration');
const MIGRATIONS_TABLE_NAME = 'migrations';

async function createDevelopmentAwareDataSource(
  options?: TypeOrmModuleOptions,
): Promise<DataSource> {
  if (!options) {
    throw new Error('TypeORM 初始化缺少配置。');
  }

  const dataSource = new DataSource(options as DataSourceOptions);
  await dataSource.initialize();

  const isDevelopment =
    (process.env.NODE_ENV ?? 'development') === 'development';
  if (!isDevelopment) {
    return dataSource;
  }

  const queryRunner = dataSource.createQueryRunner();

  try {
    const migrationTableExistsResult = await queryRunner.query(
      `
        SELECT EXISTS (
          SELECT 1
          FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = $1
        ) AS "exists"
      `,
      [MIGRATIONS_TABLE_NAME],
    );
    const migrationTableExists = migrationTableExistsResult[0]?.exists === true;

    const appliedMigrationCount = migrationTableExists
      ? Number(
          (
            await queryRunner.query(
              `SELECT COUNT(*)::int AS count FROM "${MIGRATIONS_TABLE_NAME}"`,
            )
          )[0]?.count ?? 0,
        )
      : 0;

    const publicTableCount = Number(
      (
        await queryRunner.query(
          `
            SELECT COUNT(*)::int AS count
            FROM information_schema.tables
            WHERE table_schema = 'public'
              AND table_type = 'BASE TABLE'
              AND table_name <> $1
          `,
          [MIGRATIONS_TABLE_NAME],
        )
      )[0]?.count ?? 0,
    );

    const hasAppliedMigrations = appliedMigrationCount > 0;
    const hasExistingBusinessTables = publicTableCount > 0;

    if (!hasAppliedMigrations && hasExistingBusinessTables) {
      DEV_AUTO_MIGRATION_LOGGER.warn(
        '检测到当前数据库已存在业务表，但没有 migration 执行历史。为避免初始化迁移撞表，开发环境自动迁移已跳过；如需纳入 migration 管理，请先手动对齐 migrations 表或使用空库启动。',
      );
      return dataSource;
    }

    const hasPendingMigrations = await dataSource.showMigrations();

    if (hasPendingMigrations) {
      DEV_AUTO_MIGRATION_LOGGER.log(
        '开发环境检测到待执行 migration，正在自动应用。',
      );
      await dataSource.runMigrations();
    } else {
      DEV_AUTO_MIGRATION_LOGGER.log('开发环境未检测到待执行 migration。');
    }
  } finally {
    await queryRunner.release();
  }

  return dataSource;
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      dataSourceFactory: createDevelopmentAwareDataSource,
      useFactory: (config: ConfigService) => {
        const nodeEnv = config.get<string>('NODE_ENV', 'development');
        const isProduction = nodeEnv === 'production';

        return {
          type: 'postgres',
          host: config.get<string>('DB_HOST')!,
          port: config.get<number>('DB_PORT', 5432),
          username: config.get('DB_USER', 'postgres'),
          password: config.get<string>('DB_PASS'),
          database: config.get('DB_NAME', 'openviking_admin'),
          entities: [__dirname + '/**/*.entity{.ts,.js}'],
          migrations: [__dirname + '/migrations/*{.ts,.js}'],
          migrationsRun: false,
          synchronize: config.get('DB_SYNCHRONIZE', 'false') === 'true',
          logging: !isProduction,
        };
      },
    }),
    CommonModule,
    AuthModule,
    KnowledgeBaseModule,
    KnowledgeTreeModule,
    ImportTaskModule,
    SearchModule,
    SystemModule,
    UsersModule,
    TenantModule,
    SettingsModule,
    AuditModule,
    CapabilitiesModule,
    McpModule,
  ],
  providers: [
    { provide: APP_INTERCEPTOR, useClass: SuccessResponseInterceptor },
    { provide: APP_INTERCEPTOR, useClass: TenantCleanupInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestTraceMiddleware).forRoutes({
      path: '*path',
      method: RequestMethod.ALL,
    });
  }
}
