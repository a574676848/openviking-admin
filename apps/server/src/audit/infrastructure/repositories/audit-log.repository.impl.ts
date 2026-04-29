import { Injectable, Inject, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, type FindManyOptions } from 'typeorm';
import { AuditLog } from '../../entities/audit-log.entity';
import {
  AuditActionStat,
  AuditLogListQuery,
  IAuditLogRepository,
} from '../../domain/repositories/audit-log.repository.interface';
import type {
  AuditLogModel,
  CreateAuditLogInput,
} from '../../domain/audit-log.model';
import type { RepositoryRequest } from '../../../common/repository-request.interface';

@Injectable({ scope: Scope.REQUEST })
export class AuditLogRepositoryImpl implements IAuditLogRepository {
  constructor(
    @Inject(REQUEST) private readonly request: RepositoryRequest,
    @InjectRepository(AuditLog)
    private readonly defaultRepo: Repository<AuditLog>,
  ) {}

  private get repo(): Repository<AuditLog> {
    // AuditLog 属于控制平面审计实体，始终存放在公共库。
    return this.defaultRepo;
  }

  private toModel(entity: AuditLog): AuditLogModel {
    return {
      id: entity.id,
      tenantId: entity.tenantId,
      userId: entity.userId,
      username: entity.username,
      action: entity.action,
      target: entity.target,
      meta: entity.meta,
      ip: entity.ip,
      success: entity.success,
      createdAt: entity.createdAt,
    };
  }

  private toEntityInput(log: CreateAuditLogInput): Partial<AuditLog> {
    return {
      tenantId: log.tenantId,
      userId: log.userId,
      username: log.username,
      action: log.action,
      target: log.target,
      meta: log.meta,
      ip: log.ip,
      success: log.success,
    };
  }

  async save(log: CreateAuditLogInput): Promise<AuditLogModel> {
    const saved = await this.repo.save(this.repo.create(this.toEntityInput(log)));
    return this.toModel(saved);
  }

  async findAndCount(
    options: AuditLogListQuery,
  ): Promise<[AuditLogModel[], number]> {
    const [items, total] = await this.repo.findAndCount(
      options as FindManyOptions<AuditLog>,
    );
    return [items.map((item) => this.toModel(item)), total];
  }

  async getStats(tenantId: string | null): Promise<AuditActionStat[]> {
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
      .getRawMany<AuditActionStat>();
  }
}
