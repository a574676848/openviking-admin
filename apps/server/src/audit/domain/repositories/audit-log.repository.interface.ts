import { AuditLog } from '../../entities/audit-log.entity';

export interface IAuditLogRepository {
  save(log: Partial<AuditLog>): Promise<AuditLog>;
  findAndCount(options: {
    where: any;
    order: any;
    skip: number;
    take: number;
  }): Promise<[AuditLog[], number]>;
  getStats(tenantId: string | null): Promise<any[]>;
}

export const IAuditLogRepository = Symbol('IAuditLogRepository');
