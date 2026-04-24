import { SearchLog } from '../../entities/search-log.entity';

export const SEARCH_LOG_REPOSITORY = 'ISearchLogRepository';

export interface ISearchLogRepository {
  save(log: Partial<SearchLog>): Promise<SearchLog>;
  create(log: Partial<SearchLog>): SearchLog;
  count(options?: any): Promise<number>;
  find(options?: any): Promise<SearchLog[]>;
  getAverageLatency(tenantId?: string | null): Promise<number>;
  getStats(tenantId?: string | null): Promise<{
    total: number;
    hitCount: number;
    avgLatency: number;
  }>;
}
