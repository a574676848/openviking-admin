import { Injectable, Inject, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, type FindManyOptions } from 'typeorm';
import { SearchLog } from '../../entities/search-log.entity';
import { ISearchLogRepository } from '../../domain/repositories/search-log.repository.interface';
import type { SearchLogModel } from '../../domain/search-log.model';
import type { RepositoryFindQuery } from '../../../common/repository-query.types';

interface TenantRequest {
  tenantQueryRunner?: {
    manager: {
      getRepository: (entity: typeof SearchLog) => Repository<SearchLog>;
    };
  };
  tenantDataSource?: DataSource;
}

@Injectable({ scope: Scope.REQUEST })
export class SearchLogRepository implements ISearchLogRepository {
  constructor(
    @Inject(REQUEST) private readonly request: TenantRequest,
    @InjectRepository(SearchLog)
    private readonly defaultRepo: Repository<SearchLog>,
  ) {}

  private get repo(): Repository<SearchLog> {
    if (this.request?.tenantQueryRunner) {
      return this.request.tenantQueryRunner.manager.getRepository(SearchLog);
    }
    if (this.request?.tenantDataSource) {
      return this.request.tenantDataSource.getRepository(SearchLog);
    }
    return this.defaultRepo;
  }

  private toModel(entity: SearchLog): SearchLogModel {
    return {
      id: entity.id,
      tenantId: entity.tenantId,
      query: entity.query,
      scope: entity.scope,
      resultCount: entity.resultCount,
      scoreMax: entity.scoreMax,
      latencyMs: entity.latencyMs,
      feedback: entity.feedback,
      feedbackNote: entity.feedbackNote,
      meta: entity.meta,
      createdAt: entity.createdAt,
    };
  }

  private toEntityInput(log: Partial<SearchLogModel>): Partial<SearchLog> {
    return {
      id: log.id,
      tenantId: log.tenantId,
      query: log.query,
      scope: log.scope,
      resultCount: log.resultCount,
      scoreMax: log.scoreMax,
      latencyMs: log.latencyMs,
      feedback: log.feedback,
      feedbackNote: log.feedbackNote,
      meta: log.meta as Record<string, any> | undefined,
      createdAt: log.createdAt,
    };
  }

  async save(log: Partial<SearchLogModel>): Promise<SearchLogModel> {
    const saved = await this.repo.save(this.repo.create(this.toEntityInput(log)));
    return this.toModel(saved);
  }

  create(log: Partial<SearchLogModel>): SearchLogModel {
    return this.toModel(this.repo.create(this.toEntityInput(log)));
  }

  async count(options?: RepositoryFindQuery<SearchLogModel>): Promise<number> {
    return this.repo.count((options ?? {}) as FindManyOptions<SearchLog>);
  }

  async find(options?: RepositoryFindQuery<SearchLogModel>): Promise<SearchLogModel[]> {
    const items = await this.repo.find((options ?? {}) as FindManyOptions<SearchLog>);
    return items.map((item) => this.toModel(item));
  }

  async getAverageLatency(tenantId?: string | null): Promise<number> {
    const query = this.repo
      .createQueryBuilder('l')
      .select('AVG(l.latency_ms)', 'avg');
    if (tenantId) {
      query.where('l.tenantId = :tenantId', { tenantId });
    }
    const result = await query.getRawOne<{ avg: string | null }>();
    return result?.avg ? Number(result.avg) : 0;
  }

  async getStats(tenantId?: string | null): Promise<{
    total: number;
    hitCount: number;
    avgLatency: number;
  }> {
    const where = tenantId ? { tenantId } : {};
    const total = await this.repo.count({ where });
    const hitCount = await this.repo.count({
      where: {
        ...where,
        resultCount: 0,
      },
    });
    const avgLatency = await this.getAverageLatency(tenantId);

    return { total, hitCount, avgLatency };
  }
}
