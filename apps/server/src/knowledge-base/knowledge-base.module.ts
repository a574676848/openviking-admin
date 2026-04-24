import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KnowledgeBase } from './entities/knowledge-base.entity';
import { KnowledgeBaseController } from './knowledge-base.controller';
import { KnowledgeBaseService } from './knowledge-base.service';
import { TenantModule } from '../tenant/tenant.module';
import { KNOWLEDGE_BASE_REPOSITORY } from './domain/repositories/knowledge-base.repository.interface';
import { TypeOrmKnowledgeBaseRepository } from './infrastructure/repositories/knowledge-base.repository';

@Module({
  imports: [TypeOrmModule.forFeature([KnowledgeBase]), TenantModule],
  controllers: [KnowledgeBaseController],
  providers: [
    KnowledgeBaseService,
    {
      provide: KNOWLEDGE_BASE_REPOSITORY,
      useClass: TypeOrmKnowledgeBaseRepository,
    },
  ],
  exports: [KnowledgeBaseService, KNOWLEDGE_BASE_REPOSITORY],
})
export class KnowledgeBaseModule {}
