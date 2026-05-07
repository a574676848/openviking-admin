import type { ImportTaskModel } from '../import-task.model';
import type {
  RepositoryFindOneQuery,
} from '../../../common/repository-query.types';

export const IMPORT_TASK_REPOSITORY = Symbol('IImportTaskRepository');

export interface IImportTaskRepository {
  findAll(tenantId: string | null): Promise<ImportTaskModel[]>;
  findById(id: string, tenantId?: string | null): Promise<ImportTaskModel | null>;
  create(data: Partial<ImportTaskModel>): ImportTaskModel;
  save(task: ImportTaskModel | ImportTaskModel[]): Promise<ImportTaskModel | ImportTaskModel[]>;
  update(id: string, data: Partial<ImportTaskModel>): Promise<void>;
  delete(id: string, tenantId?: string | null): Promise<void>;
  findOne(options: RepositoryFindOneQuery<ImportTaskModel>): Promise<ImportTaskModel | null>;
  count(where?: Record<string, unknown>): Promise<number>;
  find(
    where?: Record<string, unknown>,
    order?: Record<string, 'ASC' | 'DESC'>,
    take?: number,
  ): Promise<ImportTaskModel[]>;
}
