import { Module } from '@nestjs/common';
import { SystemController } from './system.controller';
import { PublicHealthController } from './public-health.controller';
import { SystemService } from './system.service';
import { SettingsModule } from '../settings/settings.module';
import { ImportTaskModule } from '../import-task/import-task.module';
import { KnowledgeBaseModule } from '../knowledge-base/knowledge-base.module';
import { SearchModule } from '../search/search.module';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [
    SettingsModule,
    ImportTaskModule,
    KnowledgeBaseModule,
    SearchModule,
    CommonModule,
  ],
  controllers: [SystemController, PublicHealthController],
  providers: [SystemService],
})
export class SystemModule {}
