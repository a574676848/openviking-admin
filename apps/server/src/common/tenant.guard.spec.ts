import type { ExecutionContext } from '@nestjs/common';
import { TenantGuard } from './tenant.guard';
import { SystemRoles } from '../users/entities/user.entity';
import { TenantIsolationLevel } from './constants/system.enum';
function createExecutionContext(request: unknown) {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

describe('TenantGuard', () => {
  const query = jest.fn();
  const connect = jest.fn();
  const queryRunner = { connect, query };
  const defaultDataSource = {
    createQueryRunner: jest.fn(() => queryRunner),
  };
  const tenantCache = {
    getIsolationConfigByTenantRecordId: jest.fn(),
  };
  const dynamicDS = {
    getTenantDataSource: jest.fn(),
  };

  const guard = new TenantGuard(
    defaultDataSource as never,
    tenantCache as never,
    dynamicDS as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('应该为 medium 隔离租户设置 schema search_path', async () => {
    tenantCache.getIsolationConfigByTenantRecordId.mockResolvedValue({
      tenantId: 'tenant-a-b',
      level: TenantIsolationLevel.MEDIUM,
    });
    const request = {
      user: {
        id: 'user-1',
        role: SystemRoles.TENANT_ADMIN,
        tenantId: 'tenant-record-1',
      },
    } as Record<string, unknown>;

    const allowed = await guard.canActivate(createExecutionContext(request));

    expect(allowed).toBe(true);
    expect(connect).toHaveBeenCalled();
    expect(query).toHaveBeenCalledWith(
      'SET search_path TO "tenant_tenant_a_b", public',
    );
    expect(request.tenantScope).toBe('tenant-a-b');
  });

  it('应该为 small 隔离租户落到 public schema', async () => {
    tenantCache.getIsolationConfigByTenantRecordId.mockResolvedValue({
      tenantId: 'tenant-small',
      level: TenantIsolationLevel.SMALL,
    });
    const request = {
      user: {
        id: 'user-1',
        role: SystemRoles.TENANT_VIEWER,
        tenantId: 'tenant-record-small',
      },
    } as Record<string, unknown>;

    const allowed = await guard.canActivate(createExecutionContext(request));

    expect(allowed).toBe(true);
    expect(connect).toHaveBeenCalled();
    expect(query).toHaveBeenCalledWith('SET search_path TO public');
    expect(request.tenantScope).toBe('tenant-small');
  });

  it('应该为 large 隔离租户挂载独立数据源', async () => {
    const tenantDataSource = { name: 'tenant-ds' };
    tenantCache.getIsolationConfigByTenantRecordId.mockResolvedValue({
      tenantId: 'tenant-mem',
      level: TenantIsolationLevel.LARGE,
      dbConfig: { host: 'db.example.com' },
    });
    dynamicDS.getTenantDataSource.mockResolvedValue(tenantDataSource);

    const request = {
      user: {
        id: 'user-1',
        role: SystemRoles.TENANT_OPERATOR,
        tenantId: 'tenant-record-2',
      },
    } as Record<string, unknown>;

    const allowed = await guard.canActivate(createExecutionContext(request));

    expect(allowed).toBe(true);
    expect(dynamicDS.getTenantDataSource).toHaveBeenCalledWith('tenant-mem', {
      host: 'db.example.com',
    });
    expect(request.tenantDataSource).toBe(tenantDataSource);
    expect(request.tenantScope).toBe('tenant-mem');
  });

  it('应该让超管落到 public schema', async () => {
    const request = {
      user: {
        id: 'super-1',
        role: SystemRoles.SUPER_ADMIN,
        tenantId: null,
      },
    } as Record<string, unknown>;

    const allowed = await guard.canActivate(createExecutionContext(request));

    expect(allowed).toBe(true);
    expect(query).toHaveBeenCalledWith('SET search_path TO public');
    expect(request.tenantScope).toBeNull();
  });

  it('缺少用户上下文时应该拒绝访问', async () => {
    const request = {} as Record<string, unknown>;

    const allowed = await guard.canActivate(createExecutionContext(request));

    expect(allowed).toBe(false);
    expect(tenantCache.getIsolationConfigByTenantRecordId).not.toHaveBeenCalled();
  });

  it('租户配置读取失败时应该抛错', async () => {
    tenantCache.getIsolationConfigByTenantRecordId.mockRejectedValue(
      new Error('cache down'),
    );
    const request = {
      user: {
        id: 'user-1',
        role: SystemRoles.TENANT_ADMIN,
        tenantId: 'tenant-record-fail',
      },
    } as Record<string, unknown>;

    await expect(guard.canActivate(createExecutionContext(request))).rejects.toThrow(
      'cache down',
    );
  });

  it('large 隔离数据源构造失败时应该抛错', async () => {
    tenantCache.getIsolationConfigByTenantRecordId.mockResolvedValue({
      tenantId: 'tenant-large',
      level: TenantIsolationLevel.LARGE,
      dbConfig: { host: 'db.example.com' },
    });
    dynamicDS.getTenantDataSource.mockRejectedValue(new Error('db down'));
    const request = {
      user: {
        id: 'user-1',
        role: SystemRoles.TENANT_OPERATOR,
        tenantId: 'tenant-record-large',
      },
    } as Record<string, unknown>;

    await expect(guard.canActivate(createExecutionContext(request))).rejects.toThrow(
      'db down',
    );
  });

  it('找不到租户隔离配置时应该直接抛错而不是回退公共库', async () => {
    tenantCache.getIsolationConfigByTenantRecordId.mockResolvedValue(null);
    const request = {
      user: {
        id: 'user-1',
        role: SystemRoles.TENANT_ADMIN,
        tenantId: 'tenant-record-missing',
      },
    } as Record<string, unknown>;

    await expect(guard.canActivate(createExecutionContext(request))).rejects.toThrow(
      '租户隔离配置不存在：tenant-record-missing',
    );
    expect(defaultDataSource.createQueryRunner).not.toHaveBeenCalled();
  });

  it('租户引用传入业务编码时也应该能命中 large 独立库配置', async () => {
    const tenantDataSource = { name: 'tenant-ds-fallback' };
    tenantCache.getIsolationConfigByTenantRecordId.mockResolvedValue({
      tenantId: 'mem',
      level: TenantIsolationLevel.LARGE,
      dbConfig: { host: 'db.mem.example.com' },
    });
    dynamicDS.getTenantDataSource.mockResolvedValue(tenantDataSource);

    const request = {
      user: {
        id: 'user-1',
        role: SystemRoles.TENANT_ADMIN,
        tenantId: 'mem',
      },
    } as Record<string, unknown>;

    const allowed = await guard.canActivate(createExecutionContext(request));

    expect(allowed).toBe(true);
    expect(dynamicDS.getTenantDataSource).toHaveBeenCalledWith('mem', {
      host: 'db.mem.example.com',
    });
    expect(request.tenantScope).toBe('mem');
  });

  it('large 租户缺少独立库配置时应该直接抛错', async () => {
    tenantCache.getIsolationConfigByTenantRecordId.mockResolvedValue({
      tenantId: 'tenant-large',
      level: TenantIsolationLevel.LARGE,
    });
    const request = {
      user: {
        id: 'user-1',
        role: SystemRoles.TENANT_OPERATOR,
        tenantId: 'tenant-record-large',
      },
    } as Record<string, unknown>;

    await expect(guard.canActivate(createExecutionContext(request))).rejects.toThrow(
      'LARGE 租户缺少独立库配置：tenant-large',
    );
    expect(defaultDataSource.createQueryRunner).not.toHaveBeenCalled();
  });
});
