import type { FindOptionsWhere } from 'typeorm';
import { Tenant } from './entities/tenant.entity';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function buildTenantIdentityWhere(
  tenantIdOrRecordId: string,
): FindOptionsWhere<Tenant>[] {
  const where: FindOptionsWhere<Tenant>[] = [{ tenantId: tenantIdOrRecordId }];

  if (UUID_PATTERN.test(tenantIdOrRecordId)) {
    where.push({ id: tenantIdOrRecordId });
  }

  return where;
}
