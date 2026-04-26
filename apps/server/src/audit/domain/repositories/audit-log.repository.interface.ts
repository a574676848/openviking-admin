import type {
  AuditLogModel,
  CreateAuditLogInput,
} from '../audit-log.model';

export interface AuditActionStat {
  action: string;
  count: string;
}

export interface AuditLogListQuery {
  where: Record<string, unknown>;
  order: Record<string, 'ASC' | 'DESC'>;
  skip: number;
  take: number;
}

export interface IAuditLogRepository {
  save(log: CreateAuditLogInput): Promise<AuditLogModel>;
  findAndCount(options: AuditLogListQuery): Promise<[AuditLogModel[], number]>;
  getStats(tenantId: string | null): Promise<AuditActionStat[]>;
}

export const IAuditLogRepository = Symbol('IAuditLogRepository');
