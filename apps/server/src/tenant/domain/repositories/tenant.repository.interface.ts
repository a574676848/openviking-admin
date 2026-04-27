import type { TenantModel } from '../tenant.model';

export const TENANT_REPOSITORY = 'ITenantRepository';

export interface ITenantRepository {
  findAll(): Promise<TenantModel[]>;
  findById(id: string): Promise<TenantModel | null>;
  findByTenantId(tenantId: string): Promise<TenantModel | null>;
  create(data: Partial<TenantModel>): TenantModel;
  save(tenant: TenantModel): Promise<TenantModel>;
  update(id: string, data: Partial<TenantModel>): Promise<void>;
  delete(id: string): Promise<void>;
  purge(id: string): Promise<void>;
}
