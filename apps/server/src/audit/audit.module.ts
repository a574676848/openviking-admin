import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLog } from './entities/audit-log.entity';
import { AuditService } from './audit.service';
import { AuditController } from './audit.controller';
import { AuditClientLogController } from './audit-client-log.controller';

import { IAuditLogRepository } from './domain/repositories/audit-log.repository.interface';
import { AuditLogRepositoryImpl } from './infrastructure/repositories/audit-log.repository.impl';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([AuditLog])],
  providers: [
    AuditService,
    {
      provide: IAuditLogRepository,
      useClass: AuditLogRepositoryImpl,
    },
  ],
  controllers: [AuditController, AuditClientLogController],
  exports: [AuditService],
})
export class AuditModule {}
