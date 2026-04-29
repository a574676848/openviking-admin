import { buildTenantIdentityWhere } from './tenant-identity.util';

describe('buildTenantIdentityWhere', () => {
  it('业务租户标识不应生成 UUID 主键查询条件', () => {
    expect(buildTenantIdentityWhere('test3')).toEqual([{ tenantId: 'test3' }]);
  });

  it('UUID 租户记录主键应同时支持 tenantId 和 id 查询', () => {
    const id = '1a229286-d84a-4ec2-9402-b27b868f6733';

    expect(buildTenantIdentityWhere(id)).toEqual([{ tenantId: id }, { id }]);
  });
});
