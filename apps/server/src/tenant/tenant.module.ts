import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from './entities/tenant.entity';
import { Integration } from './entities/integration.entity';
import { TenantService } from './tenant.service';
import { IntegrationService } from './integration.service';
import { TenantController } from './tenant.controller';
import { IntegrationController } from './integration.controller';
import { SchemaInitializerService } from './schema-initializer.service';
import { TenantCacheService } from './tenant-cache.service';
import { TenantRepository } from './infrastructure/repositories/tenant.repository';
import { TENANT_REPOSITORY } from './domain/repositories/tenant.repository.interface';
import { IIntegrationRepository } from './domain/repositories/integration.repository.interface';
import { IntegrationRepositoryImpl } from './infrastructure/repositories/integration.repository.impl';
import { UsersModule } from '../users/users.module';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Tenant, Integration]), UsersModule],
  providers: [
    TenantService,
    IntegrationService,
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
  controllers: [TenantController, IntegrationController],
  exports: [
    TenantService,
    IntegrationService,
    TenantCacheService,
    TENANT_REPOSITORY,
  ],
})
export class TenantModule {}
