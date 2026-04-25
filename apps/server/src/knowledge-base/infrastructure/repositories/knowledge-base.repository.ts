import { Injectable, Inject, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { KnowledgeBase } from '../../entities/knowledge-base.entity';
import { IKnowledgeBaseRepository } from '../../domain/repositories/knowledge-base.repository.interface';
import type { RepositoryRequest } from '../../../common/repository-request.interface';

@Injectable({ scope: Scope.REQUEST })
export class TypeOrmKnowledgeBaseRepository implements IKnowledgeBaseRepository {
  constructor(
    @Inject(REQUEST) private readonly request: RepositoryRequest,
    @InjectRepository(KnowledgeBase)
    private readonly defaultRepo: Repository<KnowledgeBase>,
  ) {}

  private get repo(): Repository<KnowledgeBase> {
    if (this.request?.tenantQueryRunner) {
      return this.request.tenantQueryRunner.manager.getRepository(
        KnowledgeBase,
      );
    }
    if (this.request?.tenantDataSource) {
      return this.request.tenantDataSource.getRepository(KnowledgeBase);
    }
    return this.defaultRepo;
  }

  async findAll(tenantId: string | null): Promise<KnowledgeBase[]> {
    const where = tenantId ? { tenantId } : {};
    return this.repo.find({ where, order: { createdAt: 'DESC' } });
  }

  async findById(
    id: string,
    tenantId?: string | null,
  ): Promise<KnowledgeBase | null> {
    const where: Record<string, string> = { id };
    if (tenantId) where.tenantId = tenantId;
    return this.repo.findOne({ where });
  }

  async count(tenantId?: string | null): Promise<number> {
    const where = tenantId ? { tenantId } : {};
    return this.repo.count({ where });
  }

  create(data: Partial<KnowledgeBase>): KnowledgeBase {
    return this.repo.create(data);
  }

  async save(kb: KnowledgeBase): Promise<KnowledgeBase> {
    return this.repo.save(kb);
  }

  async delete(kb: KnowledgeBase): Promise<void> {
    await this.repo.remove(kb);
  }
}
