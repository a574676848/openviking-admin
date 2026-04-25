import { Injectable, Inject, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from '../../entities/audit-log.entity';
import { IAuditLogRepository } from '../../domain/repositories/audit-log.repository.interface';
import type { RepositoryRequest } from '../../../common/repository-request.interface';

interface FindAndCountOptions {
  where: Record<string, unknown>;
  order: Record<string, 'ASC' | 'DESC'>;
  skip: number;
  take: number;
}

interface ActionStat {
  action: string;
  count: string;
}

@Injectable({ scope: Scope.REQUEST })
export class AuditLogRepositoryImpl implements IAuditLogRepository {
  constructor(
    @Inject(REQUEST) private readonly request: RepositoryRequest,
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

  async findAndCount(
    options: FindAndCountOptions,
  ): Promise<[AuditLog[], number]> {
    return this.repo.findAndCount(options);
  }

  async getStats(tenantId: string | null): Promise<ActionStat[]> {
    const qb = this.repo
      .createQueryBuilder('l')
      .select('l.action', 'action')
      .addSelect('COUNT(*)', 'count');

    if (tenantId) {
      qb.where('l.tenantId = :tenantId', { tenantId });
    }

    return qb
      .groupBy('l.action')
      .orderBy('count', 'DESC')
      .getRawMany<ActionStat>();
  }
}
