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
import { KnowledgeBaseModule } from '../knowledge-base/knowledge-base.module';
import { KnowledgeTreeModule } from '../knowledge-tree/knowledge-tree.module';
import { FeishuIntegrator } from './strategies/feishu.integrator';
import { DingTalkIntegrator } from './strategies/dingtalk.integrator';
import { GitIntegrator } from './strategies/git.integrator';
import { IMPORT_TASK_REPOSITORY } from './domain/repositories/import-task.repository.interface';
import { TypeOrmImportTaskRepository } from './infrastructure/repositories/import-task.repository';
import { LocalImportStorageService } from './local-import-storage.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([ImportTask]),
    SettingsModule,
    TenantModule,
    CommonModule,
    AuditModule,
    KnowledgeBaseModule,
    KnowledgeTreeModule,
  ],
  controllers: [ImportTaskController],
  providers: [
    ImportTaskService,
    TaskWorkerService,
    FeishuIntegrator,
    DingTalkIntegrator,
    GitIntegrator,
    LocalImportStorageService,
    {
      provide: IMPORT_TASK_REPOSITORY,
      useClass: TypeOrmImportTaskRepository,
    },
  ],
  exports: [ImportTaskService, TaskWorkerService, IMPORT_TASK_REPOSITORY],
})
export class ImportTaskModule {}
