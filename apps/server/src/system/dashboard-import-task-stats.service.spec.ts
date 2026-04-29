import { DashboardImportTaskStatsService } from './dashboard-import-task-stats.service';
import { TenantIsolationLevel } from '../common/constants/system.enum';
import { ImportTask } from '../import-task/entities/import-task.entity';

describe('DashboardImportTaskStatsService', () => {
  const defaultDataSource = {
    getRepository: jest.fn(),
    createQueryRunner: jest.fn(),
  };
  const dynamicDS = {
    getTenantDataSource: jest.fn(),
  };
  const taskRepo = {
    count: jest.fn(),
    find: jest.fn(),
  };

  let service: DashboardImportTaskStatsService;
  let smallTaskRepo: { count: jest.Mock; find: jest.Mock };
  let mediumTaskRepo: { count: jest.Mock; find: jest.Mock };
  let largeTaskRepo: { count: jest.Mock; find: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    taskRepo.count.mockResolvedValue(0);
    taskRepo.find.mockResolvedValue([]);
    smallTaskRepo = {
      count: jest.fn().mockResolvedValue(0),
      find: jest.fn().mockResolvedValue([]),
    };
    mediumTaskRepo = {
      count: jest.fn().mockResolvedValue(0),
      find: jest.fn().mockResolvedValue([]),
    };
    largeTaskRepo = {
      count: jest.fn().mockResolvedValue(0),
      find: jest.fn().mockResolvedValue([]),
    };
    defaultDataSource.getRepository.mockReturnValue(smallTaskRepo);
    defaultDataSource.createQueryRunner.mockReturnValue({
      connect: jest.fn().mockResolvedValue(undefined),
      query: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
      manager: {
        getRepository: jest.fn().mockReturnValue(mediumTaskRepo),
      },
    });
    dynamicDS.getTenantDataSource.mockResolvedValue({
      getRepository: jest.fn().mockReturnValue(largeTaskRepo),
    });
    service = new DashboardImportTaskStatsService(
      defaultDataSource as never,
      dynamicDS as never,
      taskRepo as never,
    );
  });

  it('平台态应跨 SMALL、MEDIUM、LARGE 聚合导入任务并按时间取最近任务', async () => {
    smallTaskRepo.count
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(1);
    smallTaskRepo.find.mockResolvedValue([
      {
        id: 'task-small',
        tenantId: 'tenant-small',
        status: 'running',
        createdAt: new Date('2026-04-29T10:00:00.000Z'),
      },
    ]);
    mediumTaskRepo.count
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0);
    mediumTaskRepo.find.mockResolvedValue([
      {
        id: 'task-medium',
        tenantId: 'tenant-medium',
        status: 'failed',
        createdAt: new Date('2026-04-29T11:00:00.000Z'),
      },
    ]);
    largeTaskRepo.count
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(1);
    largeTaskRepo.find.mockResolvedValue([
      {
        id: 'task-large',
        tenantId: 'tenant-large',
        status: 'running',
        createdAt: new Date('2026-04-29T12:00:00.000Z'),
      },
    ]);

    const result = await service.resolvePlatformStats([
      {
        tenantId: 'tenant-small',
        isolationLevel: TenantIsolationLevel.SMALL,
      },
      {
        tenantId: 'tenant-medium',
        isolationLevel: TenantIsolationLevel.MEDIUM,
      },
      {
        tenantId: 'tenant-large',
        isolationLevel: TenantIsolationLevel.LARGE,
        dbConfig: { database: 'tenant_large' },
      },
    ] as never);

    expect(defaultDataSource.getRepository).toHaveBeenCalledWith(ImportTask);
    expect(defaultDataSource.createQueryRunner).toHaveBeenCalledTimes(1);
    expect(dynamicDS.getTenantDataSource).toHaveBeenCalledWith('tenant-large', {
      database: 'tenant_large',
    });
    expect(result.total).toBe(9);
    expect(result.failed).toBe(1);
    expect(result.running).toBe(2);
    expect(result.recentTasks.map((task) => task.id)).toEqual([
      'task-large',
      'task-medium',
      'task-small',
    ]);
  });

  it('没有活跃租户时应回退共享仓储', async () => {
    taskRepo.count
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0);
    taskRepo.find.mockResolvedValue([{ id: 'shared-task' }]);

    const result = await service.resolvePlatformStats([]);

    expect(taskRepo.count).toHaveBeenCalledWith({});
    expect(taskRepo.count).toHaveBeenCalledWith({ status: 'failed' });
    expect(taskRepo.count).toHaveBeenCalledWith({ status: 'running' });
    expect(result).toEqual({
      total: 2,
      failed: 1,
      running: 0,
      recentTasks: [{ id: 'shared-task' }],
    });
  });
});
