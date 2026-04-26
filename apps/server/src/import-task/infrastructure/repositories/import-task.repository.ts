import { Injectable, Inject, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, type FindOneOptions } from 'typeorm';
import { ImportTask } from '../../entities/import-task.entity';
import { IImportTaskRepository } from '../../domain/repositories/import-task.repository.interface';
import type { ImportTaskModel } from '../../domain/import-task.model';
import type { RepositoryFindOneQuery } from '../../../common/repository-query.types';
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

  private toModel(entity: ImportTask): ImportTaskModel {
    return {
      id: entity.id,
      tenantId: entity.tenantId,
      integrationId: entity.integrationId,
      kbId: entity.kbId,
      sourceType: entity.sourceType,
      sourceUrl: entity.sourceUrl,
      targetUri: entity.targetUri,
      status: entity.status,
      nodeCount: entity.nodeCount,
      vectorCount: entity.vectorCount,
      errorMsg: entity.errorMsg,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }

  private toEntityInput(data: Partial<ImportTaskModel>): Partial<ImportTask> {
    return {
      id: data.id,
      tenantId: data.tenantId,
      integrationId: data.integrationId,
      kbId: data.kbId,
      sourceType: data.sourceType,
      sourceUrl: data.sourceUrl,
      targetUri: data.targetUri,
      status: data.status,
      nodeCount: data.nodeCount,
      vectorCount: data.vectorCount,
      errorMsg: data.errorMsg,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    };
  }

  async findAll(tenantId: string | null): Promise<ImportTaskModel[]> {
    const where = tenantId ? { tenantId } : {};
    const items = await this.repo.find({ where, order: { createdAt: 'DESC' } });
    return items.map((item) => this.toModel(item));
  }

  async findById(
    id: string,
    tenantId?: string | null,
  ): Promise<ImportTaskModel | null> {
    const where: Record<string, string> = { id };
    if (tenantId) where.tenantId = tenantId;
    const entity = await this.repo.findOne({ where });
    return entity ? this.toModel(entity) : null;
  }

  create(data: Partial<ImportTaskModel>): ImportTaskModel {
    return this.toModel(this.repo.create(this.toEntityInput(data)));
  }

  async save(task: ImportTaskModel | ImportTaskModel[]): Promise<ImportTaskModel | ImportTaskModel[]> {
    if (Array.isArray(task)) {
      const payload = task.map((item) => this.repo.create(this.toEntityInput(item)));
      const saved = await this.repo.save(payload);
      return saved.map((item) => this.toModel(item));
    }

    const saved = await this.repo.save(
      this.repo.create(this.toEntityInput(task)),
    );
    return this.toModel(saved);
  }

  async update(id: string, data: Partial<ImportTaskModel>): Promise<void> {
    await this.repo.update(id, this.toEntityInput(data));
  }

  async findOne(
    options: RepositoryFindOneQuery<ImportTaskModel>,
  ): Promise<ImportTaskModel | null> {
    const entity = await this.repo.findOne(options as FindOneOptions<ImportTask>);
    return entity ? this.toModel(entity) : null;
  }

  async count(where?: Record<string, unknown>): Promise<number> {
    return this.repo.count({ where: where ?? {} });
  }

  async find(
    where?: Record<string, unknown>,
    order?: Record<string, 'ASC' | 'DESC'>,
    take?: number,
  ): Promise<ImportTaskModel[]> {
    const items = await this.repo.find({ where, order, take });
    return items.map((item) => this.toModel(item));
  }
}
