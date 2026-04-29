import type { Request } from 'express';
import type { DataSource, QueryRunner } from 'typeorm';

/** 经过 JwtAuthGuard + TenantGuard 注入后的请求类型 */
export interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    username: string;
    role: string;
    tenantId: string | null;
    isAdminSwitch?: boolean;
  };
  tenantScope: string | null;
  tenantDataSource?: DataSource;
  tenantQueryRunner?: QueryRunner;
  requestId?: string;
  traceId?: string;
}
