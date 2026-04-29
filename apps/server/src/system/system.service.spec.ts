import { SystemService } from './system.service';
import { TenantIsolationLevel } from '../common/constants/system.enum';

describe('SystemService', () => {
  const defaultDataSource = {
    getRepository: jest.fn(),
    createQueryBuilder: jest.fn(),
    createQueryRunner: jest.fn(),
  };
  const settings = {
    resolveOVConfig: jest.fn(),
  };
  const ovClient = {
    getHealth: jest.fn(),
    request: jest.fn(),
  };
  const dynamicDS = {
    getTenantDataSource: jest.fn(),
  };
  const taskRepo = {
    count: jest.fn(),
    find: jest.fn(),
  };
  const kbRepo = {
    count: jest.fn(),
  };
  const logRepo = {
    count: jest.fn(),
  };
  const tenantRepo = {
    findAll: jest.fn(),
    findById: jest.fn(),
    findByTenantId: jest.fn(),
  };
  const dashboardImportTaskStats = {
    resolvePlatformStats: jest.fn(),
  };

  let service: SystemService;
  let smallKnowledgeBaseRepo: { count: jest.Mock };
  let largeKnowledgeBaseRepo: { count: jest.Mock };
  let searchLeaderboardQuery: {
    from: jest.Mock;
    select: jest.Mock;
    addSelect: jest.Mock;
    where: jest.Mock;
    andWhere: jest.Mock;
    groupBy: jest.Mock;
    orderBy: jest.Mock;
    limit: jest.Mock;
    getRawMany: jest.Mock;
  };
  let mediumQueryRunner: {
    connect: jest.Mock;
    query: jest.Mock;
    release: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    settings.resolveOVConfig.mockResolvedValue({
      baseUrl: 'http://ov.local',
      apiKey: '',
      account: 'default',
    });
    ovClient.getHealth.mockResolvedValue({ version: '1.0.0' });
    ovClient.request.mockResolvedValue({
      result: {
        status: '| Queue | Pending |\n| ingest | 1 |',
      },
    });
    taskRepo.count.mockResolvedValue(0);
    taskRepo.find.mockResolvedValue([]);
    kbRepo.count.mockResolvedValue(0);
    logRepo.count.mockResolvedValue(0);
    tenantRepo.findAll.mockResolvedValue([]);
    tenantRepo.findById.mockResolvedValue(null);
    tenantRepo.findByTenantId.mockResolvedValue(null);
    dashboardImportTaskStats.resolvePlatformStats.mockResolvedValue({
      total: 0,
      failed: 0,
      running: 0,
      recentTasks: [],
    });
    smallKnowledgeBaseRepo = {
      count: jest.fn().mockResolvedValue(0),
    };
    largeKnowledgeBaseRepo = {
      count: jest.fn().mockResolvedValue(0),
    };
    searchLeaderboardQuery = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([]),
    };
    mediumQueryRunner = {
      connect: jest.fn().mockResolvedValue(undefined),
      query: jest
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce([{ count: 0 }]),
      release: jest.fn().mockResolvedValue(undefined),
    };
    defaultDataSource.getRepository.mockReturnValue(smallKnowledgeBaseRepo);
    defaultDataSource.createQueryBuilder.mockReturnValue(
      searchLeaderboardQuery,
    );
    defaultDataSource.createQueryRunner.mockReturnValue(mediumQueryRunner);
    dynamicDS.getTenantDataSource.mockResolvedValue({
      getRepository: jest.fn().mockReturnValue(largeKnowledgeBaseRepo),
    });

    service = new SystemService(
      defaultDataSource as never,
      settings as never,
      ovClient as never,
      dynamicDS as never,
      taskRepo as never,
      kbRepo as never,
      logRepo as never,
      tenantRepo as never,
      dashboardImportTaskStats as never,
    );
  });

  it('tenantScope 传业务租户编码时应回退按 tenantId 查询租户', async () => {
    tenantRepo.findByTenantId.mockResolvedValue({
      id: 'tenant-1',
      tenantId: 'mem',
      quota: { maxDocs: 10 },
      status: 'active',
    });

    const result = await service.getDashboardStats('mem');

    expect(tenantRepo.findById).toHaveBeenCalledWith('mem');
    expect(tenantRepo.findByTenantId).toHaveBeenCalledWith('mem');
    expect(result).toEqual(
      expect.objectContaining({
        tenantIdentifier: 'mem',
        quota: { maxDocs: 10 },
      }),
    );
  });

  it('平台视角应聚合真实知识库总数并返回两个租户 Top5', async () => {
    tenantRepo.findAll.mockResolvedValue([
      {
        id: 'tenant-small-id',
        tenantId: 'tenant-small',
        displayName: '小租户',
        status: 'active',
        isolationLevel: TenantIsolationLevel.SMALL,
        dbConfig: null,
      },
      {
        id: 'tenant-medium-id',
        tenantId: 'tenant-medium',
        displayName: '中租户',
        status: 'active',
        isolationLevel: TenantIsolationLevel.MEDIUM,
        dbConfig: null,
      },
      {
        id: 'tenant-large-id',
        tenantId: 'tenant-large',
        displayName: '大租户',
        status: 'active',
        isolationLevel: TenantIsolationLevel.LARGE,
        dbConfig: { database: 'tenant_large' },
      },
    ]);
    smallKnowledgeBaseRepo.count.mockResolvedValue(2);
    mediumQueryRunner.query = jest
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([{ count: 3 }]);
    defaultDataSource.createQueryRunner.mockReturnValue(mediumQueryRunner);
    largeKnowledgeBaseRepo.count.mockResolvedValue(5);
    dynamicDS.getTenantDataSource.mockResolvedValue({
      getRepository: jest.fn().mockReturnValue(largeKnowledgeBaseRepo),
    });
    dashboardImportTaskStats.resolvePlatformStats.mockResolvedValue({
      total: 9,
      failed: 1,
      running: 2,
      recentTasks: [
        { id: 'task-large' },
        { id: 'task-medium' },
        { id: 'task-small' },
      ],
    });
    searchLeaderboardQuery.getRawMany.mockResolvedValue([
      { tenantId: 'tenant-large', count: '12' },
      { tenantId: 'tenant-medium', count: '7' },
      { tenantId: 'tenant-small', count: '4' },
    ]);

    const result = await service.getDashboardStats(null);

    expect(result.kbCount).toBe(10);
    expect(result.platformKbCount).toBe(10);
    expect(result.taskCount).toBe(9);
    expect(result.failedTasks).toBe(1);
    expect(result.runningTasks).toBe(2);
    expect(result.recentTasks.map((task) => task.id)).toEqual([
      'task-large',
      'task-medium',
      'task-small',
    ]);
    expect(result.tenantCount).toBe(3);
    expect(result.tenantKnowledgeBaseTop).toEqual([
      { tenantId: 'tenant-large', tenantName: '大租户', value: 5 },
      { tenantId: 'tenant-medium', tenantName: '中租户', value: 3 },
      { tenantId: 'tenant-small', tenantName: '小租户', value: 2 },
    ]);
    expect(result.tenantSearchTop).toEqual([
      { tenantId: 'tenant-large', tenantName: '大租户', value: 12 },
      { tenantId: 'tenant-medium', tenantName: '中租户', value: 7 },
      { tenantId: 'tenant-small', tenantName: '小租户', value: 4 },
    ]);
  });
});
