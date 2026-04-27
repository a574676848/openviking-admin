import type { SearchLogModel } from '../search-log.model';
import type { RepositoryFindQuery } from '../../../common/repository-query.types';

export const SEARCH_LOG_REPOSITORY = 'ISearchLogRepository';

export interface ISearchLogRepository {
  save(log: Partial<SearchLogModel>): Promise<SearchLogModel>;
  create(log: Partial<SearchLogModel>): SearchLogModel;
  count(options?: RepositoryFindQuery<SearchLogModel>): Promise<number>;
  find(options?: RepositoryFindQuery<SearchLogModel>): Promise<SearchLogModel[]>;
  getAverageLatency(tenantId?: string | null): Promise<number>;
  getStats(tenantId?: string | null): Promise<{
    total: number;
    hitCount: number;
    avgLatency: number;
  }>;
  getFeedbackStats(tenantId?: string | null): Promise<{
    helpfulCount: number;
    unhelpfulCount: number;
  }>;
  getTopUris(
    tenantId?: string | null,
    limit?: number,
  ): Promise<{ uri: string; count: number; hits: number; hitRate: number }[]>;
  getTopQueries(
    tenantId?: string | null,
    limit?: number,
  ): Promise<{ query: string; count: number; hits: number; hitRate: number }[]>;
  getDailyStats(
    tenantId?: string | null,
    days?: number,
  ): Promise<{ day: string; total: number; hits: number; hitRate: number; avgLatency: number }[]>;
}
