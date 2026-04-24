import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KnowledgeNode } from './entities/knowledge-node.entity';
import { KnowledgeTreeService } from './knowledge-tree.service';
import { KnowledgeTreeController } from './knowledge-tree.controller';

import { IKnowledgeNodeRepository } from './domain/repositories/knowledge-node.repository.interface';
import { KnowledgeNodeRepositoryImpl } from './infrastructure/repositories/knowledge-node.repository.impl';

@Module({
  imports: [TypeOrmModule.forFeature([KnowledgeNode])],
  providers: [
    KnowledgeTreeService,
    {
      provide: IKnowledgeNodeRepository,
      useClass: KnowledgeNodeRepositoryImpl,
    },
  ],
  controllers: [KnowledgeTreeController],
  exports: [KnowledgeTreeService, IKnowledgeNodeRepository],
})
export class KnowledgeTreeModule {}
