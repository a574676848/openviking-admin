import { Injectable, Inject } from '@nestjs/common';
import { Between, Like } from 'typeorm';
import { IAuditLogRepository } from './domain/repositories/audit-log.repository.interface';

interface AuditEntry {
  tenantId?: string;
  userId?: string;
  username?: string;
  action: string;
  target?: string;
  meta?: Record<string, unknown>;
  ip?: string;
  success?: boolean;
}

interface AuditQuery {
  page?: number;
  pageSize?: number;
  action?: string;
  username?: string;
  dateFrom?: string;
  dateTo?: string;
}

@Injectable()
export class AuditService {
  constructor(
    @Inject(IAuditLogRepository)
    private readonly repo: IAuditLogRepository,
  ) {}

  async log(entry: AuditEntry) {
    return this.repo.save({ success: true, ...entry });
  }

  async findAll(tenantId: string | null, query: AuditQuery) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 50, 200);
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = {};
    if (tenantId) where.tenantId = tenantId;
    if (query.action) where.action = query.action;
    if (query.username) where.username = Like(`%${query.username}%`);
    if (query.dateFrom || query.dateTo) {
      where.createdAt = Between(
        query.dateFrom ? new Date(query.dateFrom) : new Date('2000-01-01'),
        query.dateTo ? new Date(query.dateTo + 'T23:59:59') : new Date(),
      );
    }

    const [items, total] = await this.repo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip,
      take: pageSize,
    });

    return { items, total, page, pageSize, pages: Math.ceil(total / pageSize) };
  }

  async getActionStats(tenantId: string | null) {
    return this.repo.getStats(tenantId);
  }
}
