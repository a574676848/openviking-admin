import { Tenant } from '../../entities/tenant.entity';

export const TENANT_REPOSITORY = 'ITenantRepository';

export interface ITenantRepository {
  findAll(): Promise<Tenant[]>;
  findById(id: string): Promise<Tenant | null>;
  findByTenantId(tenantId: string): Promise<Tenant | null>;
  create(data: Partial<Tenant>): Tenant;
  save(tenant: Tenant): Promise<Tenant>;
  update(id: string, data: Partial<Tenant>): Promise<void>;
  delete(id: string): Promise<void>;
}
