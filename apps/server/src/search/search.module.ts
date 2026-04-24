import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SearchLog } from './entities/search-log.entity';
import { SearchService } from './search.service';
import { SearchController } from './search.controller';
import { SettingsModule } from '../settings/settings.module';
import { KnowledgeTreeModule } from '../knowledge-tree/knowledge-tree.module';
import { SEARCH_LOG_REPOSITORY } from './domain/repositories/search-log.repository.interface';
import { SearchLogRepository } from './infrastructure/repositories/search-log.repository';

@Module({
  imports: [
    TypeOrmModule.forFeature([SearchLog]),
    SettingsModule,
    KnowledgeTreeModule,
  ],
  controllers: [SearchController],
  providers: [
    SearchService,
    {
      provide: SEARCH_LOG_REPOSITORY,
      useClass: SearchLogRepository,
    },
  ],
  exports: [SearchService, SEARCH_LOG_REPOSITORY],
})
export class SearchModule {}
