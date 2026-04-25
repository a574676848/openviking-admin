import { Injectable, Inject, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, type FindManyOptions } from 'typeorm';
import { SearchLog } from '../../entities/search-log.entity';
import { ISearchLogRepository } from '../../domain/repositories/search-log.repository.interface';

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

  async save(log: Partial<SearchLog>): Promise<SearchLog> {
    return this.repo.save(log);
  }

  create(log: Partial<SearchLog>): SearchLog {
    return this.repo.create(log);
  }

  async count(options?: FindManyOptions<SearchLog>): Promise<number> {
    return this.repo.count(options);
  }

  async find(options?: FindManyOptions<SearchLog>): Promise<SearchLog[]> {
    return this.repo.find(options);
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
