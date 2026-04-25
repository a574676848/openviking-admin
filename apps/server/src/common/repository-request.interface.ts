import type { DataSource, QueryRunner } from 'typeorm';

/** Request-scoped 仓储层注入的请求类型 */
export interface RepositoryRequest {
  tenantQueryRunner?: QueryRunner;
  tenantDataSource?: DataSource;
}
