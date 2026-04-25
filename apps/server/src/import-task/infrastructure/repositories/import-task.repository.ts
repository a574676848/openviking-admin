import { Injectable, Inject, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, type FindOneOptions } from 'typeorm';
import { ImportTask } from '../../entities/import-task.entity';
import { IImportTaskRepository } from '../../domain/repositories/import-task.repository.interface';
import type { RepositoryRequest } from '../../../common/repository-request.interface';

@Injectable({ scope: Scope.REQUEST })
export class TypeOrmImportTaskRepository implements IImportTaskRepository {
  constructor(
    @Inject(REQUEST) private readonly request: RepositoryRequest,
    @InjectRepository(ImportTask)
    private readonly defaultRepo: Repository<ImportTask>,
  ) {}

  private get repo(): Repository<ImportTask> {
    if (this.request?.tenantQueryRunner) {
      return this.request.tenantQueryRunner.manager.getRepository(ImportTask);
    }
    if (this.request?.tenantDataSource) {
      return this.request.tenantDataSource.getRepository(ImportTask);
    }
    return this.defaultRepo;
  }

  async findAll(tenantId: string | null): Promise<ImportTask[]> {
    const where = tenantId ? { tenantId } : {};
    return this.repo.find({ where, order: { createdAt: 'DESC' } });
  }

  async findById(
    id: string,
    tenantId?: string | null,
  ): Promise<ImportTask | null> {
    const where: Record<string, string> = { id };
    if (tenantId) where.tenantId = tenantId;
    return this.repo.findOne({ where });
  }

  create(data: Partial<ImportTask>): ImportTask {
    return this.repo.create(data);
  }

  async save(task: ImportTask): Promise<ImportTask> {
    return this.repo.save(task);
  }

  async update(id: string, data: Partial<ImportTask>): Promise<void> {
    await this.repo.update(id, data);
  }

  async findOne(
    options: FindOneOptions<ImportTask>,
  ): Promise<ImportTask | null> {
    return this.repo.findOne(options);
  }

  async count(where?: Record<string, unknown>): Promise<number> {
    return this.repo.count({ where: where ?? {} });
  }

  async find(
    where?: Record<string, unknown>,
    order?: Record<string, 'ASC' | 'DESC'>,
    take?: number,
  ): Promise<ImportTask[]> {
    return this.repo.find({ where, order, take });
  }
}
