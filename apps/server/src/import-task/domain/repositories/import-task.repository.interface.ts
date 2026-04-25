import { ImportTask } from '../../entities/import-task.entity';
import type { FindOneOptions } from 'typeorm';

export const IMPORT_TASK_REPOSITORY = Symbol('IImportTaskRepository');

export interface IImportTaskRepository {
  findAll(tenantId: string | null): Promise<ImportTask[]>;
  findById(id: string, tenantId?: string | null): Promise<ImportTask | null>;
  create(data: Partial<ImportTask>): ImportTask;
  save(task: ImportTask | ImportTask[]): Promise<ImportTask | ImportTask[]>;
  update(id: string, data: Partial<ImportTask>): Promise<void>;
  findOne(options: FindOneOptions<ImportTask>): Promise<ImportTask | null>;
  count(where?: Record<string, unknown>): Promise<number>;
  find(
    where?: Record<string, unknown>,
    order?: Record<string, 'ASC' | 'DESC'>,
    take?: number,
  ): Promise<ImportTask[]>;
}
