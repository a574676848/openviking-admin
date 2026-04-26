import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ImportTask } from './entities/import-task.entity';
import { ImportTaskController } from './import-task.controller';
import { ImportTaskService } from './import-task.service';
import { TaskWorkerService } from './task-worker.service';
import { SettingsModule } from '../settings/settings.module';
import { TenantModule } from '../tenant/tenant.module';
import { CommonModule } from '../common/common.module';
import { AuditModule } from '../audit/audit.module';
import { FeishuIntegrator } from './strategies/feishu.integrator';
import { DingTalkIntegrator } from './strategies/dingtalk.integrator';
import { GitIntegrator } from './strategies/git.integrator';
import { IMPORT_TASK_REPOSITORY } from './domain/repositories/import-task.repository.interface';
import { TypeOrmImportTaskRepository } from './infrastructure/repositories/import-task.repository';

@Module({
  imports: [
    TypeOrmModule.forFeature([ImportTask]),
    SettingsModule,
    TenantModule,
    CommonModule,
    AuditModule,
  ],
  controllers: [ImportTaskController],
  providers: [
    ImportTaskService,
    TaskWorkerService,
    FeishuIntegrator,
    DingTalkIntegrator,
    GitIntegrator,
    {
      provide: IMPORT_TASK_REPOSITORY,
      useClass: TypeOrmImportTaskRepository,
    },
  ],
  exports: [ImportTaskService, TaskWorkerService, IMPORT_TASK_REPOSITORY],
})
export class ImportTaskModule {}
