import { Injectable, Inject, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from '../../entities/audit-log.entity';
import { IAuditLogRepository } from '../../domain/repositories/audit-log.repository.interface';

@Injectable({ scope: Scope.REQUEST })
export class AuditLogRepositoryImpl implements IAuditLogRepository {
  constructor(
    @Inject(REQUEST) private readonly request: any,
    @InjectRepository(AuditLog)
    private readonly defaultRepo: Repository<AuditLog>,
  ) {}

  private get repo(): Repository<AuditLog> {
    if (this.request?.tenantQueryRunner) {
      return this.request.tenantQueryRunner.manager.getRepository(AuditLog);
    }
    if (this.request?.tenantDataSource) {
      return this.request.tenantDataSource.getRepository(AuditLog);
    }
    return this.defaultRepo;
  }

  async save(log: Partial<AuditLog>): Promise<AuditLog> {
    return this.repo.save(this.repo.create(log));
  }

  async findAndCount(options: {
    where: any;
    order: any;
    skip: number;
    take: number;
  }): Promise<[AuditLog[], number]> {
    return this.repo.findAndCount(options);
  }

  async getStats(tenantId: string | null): Promise<any[]> {
    const qb = this.repo
      .createQueryBuilder('l')
      .select('l.action', 'action')
      .addSelect('COUNT(*)', 'count');

    if (tenantId) {
      qb.where('l.tenantId = :tenantId', { tenantId });
    }

    return qb.groupBy('l.action').orderBy('count', 'DESC').getRawMany();
  }
}
