import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CapabilitiesModule } from '../capabilities/capabilities.module';
import { ImportTaskModule } from '../import-task/import-task.module';
import { KnowledgeBaseModule } from '../knowledge-base/knowledge-base.module';
import { KnowledgeTreeModule } from '../knowledge-tree/knowledge-tree.module';
import { SettingsModule } from '../settings/settings.module';
import { WebdavController } from './webdav.controller';
import { WebdavService } from './webdav.service';

@Module({
  imports: [
    AuditModule,
    CapabilitiesModule,
    ImportTaskModule,
    KnowledgeBaseModule,
    KnowledgeTreeModule,
    SettingsModule,
  ],
  controllers: [WebdavController],
  providers: [WebdavService],
})
export class WebdavModule {}
