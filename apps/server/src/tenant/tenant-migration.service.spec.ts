import { TenantMigrationService } from './tenant-migration.service';
import { TenantIsolationLevel } from '../common/constants/system.enum';

const mockTenant = {
  id: '11111111-1111-4111-8111-111111111111',
  tenantId: 'tenant-alpha',
  displayName: 'Alpha',
  status: 'active',
  isolationLevel: TenantIsolationLevel.SMALL,
  dbConfig: null,
  createdAt: new Date(),
};

describe('TenantMigrationService', () => {
  const createService = (tenant = mockTenant) => {
    const dataSource = {
      query: jest.fn().mockResolvedValue([{ canCreate: true }]),
      showMigrations: jest.fn().mockResolvedValue(true),
      runMigrations: jest.fn().mockResolvedValue([{ name: 'AddPublicTable' }]),
    };
    const configService = {
      get: jest.fn((key: string, fallback?: string | number) => {
        const values: Record<string, string | number> = {
          DB_HOST: '127.0.0.1',
          DB_PORT: 5432,
          DB_USER: 'postgres',
          DB_PASS: 'secret',
          DB_NAME: 'openviking_admin',
        };
        return values[key] ?? fallback;
      }),
    };
    const taskRepo = {
      create: jest.fn((input) => input),
      save: jest.fn(async (input) => ({ id: 'task-1', ...input })),
      find: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
    };
    const tenantRepo = {
      find: jest.fn(),
      update: jest.fn(),
    };
    const tenantService = {
      findOneByIdOrTenantId: jest.fn().mockResolvedValue(tenant),
    };

    const service = new TenantMigrationService(
      dataSource as never,
      configService as never,
      { initialize: jest.fn() } as never,
      { getTenantDataSource: jest.fn() } as never,
      { invalidate: jest.fn() } as never,
      { log: jest.fn() } as never,
      tenantService as never,
      taskRepo as never,
      tenantRepo as never,
    );

    return { service, taskRepo, tenantService };
  };

  afterEach(() => {
    jest.useRealTimers();
  });

  it('租户迁移预检读取租户当前规格', async () => {
    const { service, tenantService } = createService();

    const result = await service.precheck({
      tenantId: 'tenant-alpha',
    });

    expect(result.passed).toBe(true);
    expect(result.targetLevel).toBe(TenantIsolationLevel.SMALL);
    expect(result.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: '配置规格',
          passed: true,
        }),
      ]),
    );
    expect(tenantService.findOneByIdOrTenantId).toHaveBeenCalledWith(
      'tenant-alpha',
    );
  });

  it('迁移到 LARGE 但缺少数据库名时预检不通过', async () => {
    const { service } = createService({
      ...mockTenant,
      isolationLevel: TenantIsolationLevel.LARGE,
      dbConfig: null,
    });

    const result = await service.precheck({
      tenantId: 'tenant-alpha',
    });

    expect(result.passed).toBe(false);
    expect(result.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: '独立数据库配置',
          passed: false,
        }),
      ]),
    );
  });

  it('预检通过后创建迁移任务并排队执行', async () => {
    jest.useFakeTimers();
    const { service, taskRepo } = createService({
      ...mockTenant,
      isolationLevel: TenantIsolationLevel.MEDIUM,
    });

    const task = await service.createTask(
      {
        tenantId: 'tenant-alpha',
      },
      { id: 'admin-1', username: 'admin' },
    );

    expect(taskRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-alpha',
        sourceLevel: TenantIsolationLevel.MEDIUM,
        targetLevel: TenantIsolationLevel.MEDIUM,
        status: 'pending',
      }),
    );
    expect(task.id).toBe('task-1');
    expect(jest.getTimerCount()).toBe(1);
  });

  it('平台公共表存在待执行 migration 时允许创建平台任务', async () => {
    jest.useFakeTimers();
    const { service, taskRepo } = createService();

    const task = await service.createPlatformTask({
      id: 'admin-1',
      username: 'admin',
    });

    expect(taskRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: 'platform',
        tenantId: null,
        sourceLevel: null,
        targetLevel: null,
        status: 'pending',
      }),
    );
    expect(task.id).toBe('task-1');
    expect(jest.getTimerCount()).toBe(1);
  });
});
