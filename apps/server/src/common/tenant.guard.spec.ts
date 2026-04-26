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
    getIsolationConfig: jest.fn(),
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
    tenantCache.getIsolationConfig.mockResolvedValue({
      level: TenantIsolationLevel.MEDIUM,
    });
    const request = {
      user: {
        id: 'user-1',
        role: SystemRoles.TENANT_ADMIN,
        tenantId: 'tenant-a-b',
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
    tenantCache.getIsolationConfig.mockResolvedValue({
      level: TenantIsolationLevel.SMALL,
    });
    const request = {
      user: {
        id: 'user-1',
        role: SystemRoles.TENANT_VIEWER,
        tenantId: 'tenant-small',
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
    tenantCache.getIsolationConfig.mockResolvedValue({
      level: TenantIsolationLevel.LARGE,
      dbConfig: { host: 'db.example.com' },
    });
    dynamicDS.getTenantDataSource.mockResolvedValue(tenantDataSource);

    const request = {
      user: {
        id: 'user-1',
        role: SystemRoles.TENANT_OPERATOR,
        tenantId: 'tenant-2',
      },
    } as Record<string, unknown>;

    const allowed = await guard.canActivate(createExecutionContext(request));

    expect(allowed).toBe(true);
    expect(dynamicDS.getTenantDataSource).toHaveBeenCalledWith(
      'tenant-2',
      { host: 'db.example.com' },
    );
    expect(request.tenantDataSource).toBe(tenantDataSource);
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
    expect(tenantCache.getIsolationConfig).not.toHaveBeenCalled();
  });

  it('租户配置读取失败时应该拒绝访问', async () => {
    tenantCache.getIsolationConfig.mockRejectedValue(new Error('cache down'));
    const request = {
      user: {
        id: 'user-1',
        role: SystemRoles.TENANT_ADMIN,
        tenantId: 'tenant-fail',
      },
    } as Record<string, unknown>;

    const allowed = await guard.canActivate(createExecutionContext(request));

    expect(allowed).toBe(false);
  });

  it('large 隔离数据源构造失败时应该拒绝访问', async () => {
    tenantCache.getIsolationConfig.mockResolvedValue({
      level: TenantIsolationLevel.LARGE,
      dbConfig: { host: 'db.example.com' },
    });
    dynamicDS.getTenantDataSource.mockRejectedValue(new Error('db down'));
    const request = {
      user: {
        id: 'user-1',
        role: SystemRoles.TENANT_OPERATOR,
        tenantId: 'tenant-large',
      },
    } as Record<string, unknown>;

    const allowed = await guard.canActivate(createExecutionContext(request));

    expect(allowed).toBe(false);
  });
});
