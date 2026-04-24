import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_GUARD, APP_INTERCEPTOR, APP_FILTER } from '@nestjs/core';
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
import { McpModule } from './mcp/mcp.module';
import { RolesGuard } from './common/roles.guard';
import { TenantCleanupInterceptor } from './common/tenant-cleanup.interceptor';
import { AllExceptionsFilter } from './common/all-exceptions.filter';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get('DB_HOST', '192.168.10.99'),
        port: config.get<number>('DB_PORT', 5432),
        username: config.get('DB_USER', 'postgres'),
        password: config.get<string>('DB_PASS'),
        database: config.get('DB_NAME', 'openviking_admin'),
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        migrations: [__dirname + '/migrations/*{.ts,.js}'],
        synchronize: config.get('NODE_ENV') !== 'production',
        logging: config.get('NODE_ENV') !== 'production',
      }),
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
    McpModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_INTERCEPTOR, useClass: TenantCleanupInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
