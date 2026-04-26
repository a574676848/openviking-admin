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
}
