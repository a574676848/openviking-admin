import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KnowledgeNode } from './entities/knowledge-node.entity';
import { KnowledgeBase } from '../knowledge-base/entities/knowledge-base.entity';
import { KnowledgeTreeService } from './knowledge-tree.service';
import { KnowledgeTreeController } from './knowledge-tree.controller';
import { SettingsModule } from '../settings/settings.module';

import { IKnowledgeNodeRepository } from './domain/repositories/knowledge-node.repository.interface';
import { KnowledgeNodeRepositoryImpl } from './infrastructure/repositories/knowledge-node.repository.impl';
import { KNOWLEDGE_BASE_REPOSITORY } from '../knowledge-base/domain/repositories/knowledge-base.repository.interface';
import { TypeOrmKnowledgeBaseRepository } from '../knowledge-base/infrastructure/repositories/knowledge-base.repository';

@Module({
  imports: [
    TypeOrmModule.forFeature([KnowledgeNode, KnowledgeBase]),
    SettingsModule,
  ],
  providers: [
    KnowledgeTreeService,
    {
      provide: IKnowledgeNodeRepository,
      useClass: KnowledgeNodeRepositoryImpl,
    },
    {
      provide: KNOWLEDGE_BASE_REPOSITORY,
      useClass: TypeOrmKnowledgeBaseRepository,
    },
  ],
  controllers: [KnowledgeTreeController],
  exports: [KnowledgeTreeService, IKnowledgeNodeRepository],
})
export class KnowledgeTreeModule {}
