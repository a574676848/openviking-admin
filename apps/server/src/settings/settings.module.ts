import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SystemConfig } from './entities/system-config.entity';
import { Tenant } from '../tenant/entities/tenant.entity';
import { SettingsService } from './settings.service';
import { SettingsController } from './settings.controller';
import { OVClientService } from '../common/ov-client.service';
import { EncryptionService } from '../common/encryption.service';

import { ISystemConfigRepository } from './domain/repositories/system-config.repository.interface';
import { SystemConfigRepositoryImpl } from './infrastructure/repositories/system-config.repository.impl';

@Module({
  imports: [TypeOrmModule.forFeature([SystemConfig, Tenant])],
  providers: [
    SettingsService,
    OVClientService,
    EncryptionService,
    {
      provide: ISystemConfigRepository,
      useClass: SystemConfigRepositoryImpl,
    },
  ],
  controllers: [SettingsController],
  exports: [SettingsService, OVClientService, EncryptionService],
})
export class SettingsModule {}
