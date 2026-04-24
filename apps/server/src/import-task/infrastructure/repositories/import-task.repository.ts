import { Injectable, Inject, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ImportTask } from '../../entities/import-task.entity';
import { IImportTaskRepository } from '../../domain/repositories/import-task.repository.interface';

@Injectable({ scope: Scope.REQUEST })
export class TypeOrmImportTaskRepository implements IImportTaskRepository {
  constructor(
    @Inject(REQUEST) private readonly request: any,
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
    const where: any = { id };
    if (tenantId) where.tenantId = tenantId;
    return this.repo.findOne({ where });
  }

  create(data: Partial<ImportTask>): ImportTask {
    return this.repo.create(data);
  }

  async save(task: ImportTask | ImportTask[]): Promise<any> {
    return this.repo.save(task as any);
  }

  async update(id: string, data: Partial<ImportTask>): Promise<void> {
    await this.repo.update(id, data);
  }

  async findOne(options: any): Promise<ImportTask | null> {
    return this.repo.findOne(options);
  }

  async count(options?: any): Promise<number> {
    return this.repo.count({ where: options });
  }

  async find(where?: any, order?: any, take?: number): Promise<ImportTask[]> {
    return this.repo.find({ where, order, take });
  }
}
