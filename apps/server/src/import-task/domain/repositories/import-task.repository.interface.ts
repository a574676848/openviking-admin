import { ImportTask } from '../../entities/import-task.entity';

export const IMPORT_TASK_REPOSITORY = Symbol('IImportTaskRepository');

export interface IImportTaskRepository {
  findAll(tenantId: string | null): Promise<ImportTask[]>;
  findById(id: string, tenantId?: string | null): Promise<ImportTask | null>;
  create(data: Partial<ImportTask>): ImportTask;
  save(task: ImportTask | ImportTask[]): Promise<any>;
  update(id: string, data: Partial<ImportTask>): Promise<void>;
  findOne(options: any): Promise<ImportTask | null>;
  count(options?: any): Promise<number>;
  find(where?: any, order?: any, take?: number): Promise<ImportTask[]>;
}
