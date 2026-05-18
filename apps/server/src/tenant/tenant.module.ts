import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from './entities/tenant.entity';
import { Integration } from './entities/integration.entity';
import { TenantService } from './tenant.service';
import { IntegrationService } from './integration.service';
import { TenantMigrationService } from './tenant-migration.service';
import { TenantController } from './tenant.controller';
import { IntegrationController } from './integration.controller';
import { TenantMigrationController } from './tenant-migration.controller';
import { SchemaInitializerService } from './schema-initializer.service';
import { TenantCacheService } from './tenant-cache.service';
import { TenantMigrationTask } from './entities/tenant-migration-task.entity';
import { TenantRepository } from './infrastructure/repositories/tenant.repository';
import { TENANT_REPOSITORY } from './domain/repositories/tenant.repository.interface';
import { IIntegrationRepository } from './domain/repositories/integration.repository.interface';
import { IntegrationRepositoryImpl } from './infrastructure/repositories/integration.repository.impl';
import { UsersModule } from '../users/users.module';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([Tenant, Integration, TenantMigrationTask]),
    UsersModule,
  ],
  providers: [
    TenantService,
    IntegrationService,
    TenantMigrationService,
    SchemaInitializerService,
    TenantCacheService,
    {
      provide: TENANT_REPOSITORY,
      useClass: TenantRepository,
    },
    {
      provide: IIntegrationRepository,
      useClass: IntegrationRepositoryImpl,
    },
  ],
  controllers: [
    TenantController,
    IntegrationController,
    TenantMigrationController,
  ],
  exports: [
    TenantService,
    IntegrationService,
    TenantCacheService,
    TENANT_REPOSITORY,
  ],
})
export class TenantModule {}
