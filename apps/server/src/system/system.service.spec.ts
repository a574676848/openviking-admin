import { SystemService } from './system.service';

describe('SystemService', () => {
  const settings = {
    resolveOVConfig: jest.fn(),
  };
  const ovClient = {
    getHealth: jest.fn(),
    request: jest.fn(),
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
  };

  let service: SystemService;

  beforeEach(() => {
    jest.clearAllMocks();
    settings.resolveOVConfig.mockResolvedValue({
      baseUrl: 'http://ov.default',
      apiKey: 'default-key',
      account: 'default',
    });
    ovClient.getHealth.mockResolvedValue({ status: 'ok', healthy: true, version: '0.3.9' });
    ovClient.request.mockImplementation(async (_conn: unknown, path: string) => {
      if (path === '/api/v1/observer/queue') {
        return {
          status: 'ok',
          result: {
            status: [
              '+----------------+---------+-------------+',
              '|     Queue      | Pending | In Progress |',
              '+----------------+---------+-------------+',
              '|   Embedding    |    0    |      0      |',
              '|    Semantic    |    1    |      0      |',
              '| Semantic-Nodes |    2    |      0      |',
              '|     TOTAL      |    3    |      0      |',
              '+----------------+---------+-------------+',
            ].join('\n'),
          },
        };
      }
      if (path === '/api/v1/observer/vikingdb') {
        return {
          status: 'ok',
          result: {
            status: [
              '+------------+-------------+--------------+--------+',
              '| Collection | Index Count | Vector Count | Status |',
              '+------------+-------------+--------------+--------+',
              '|  context   |      1      |     4032     |   OK   |',
              '|   TOTAL    |      1      |     4032     |        |',
              '+------------+-------------+--------------+--------+',
            ].join('\n'),
          },
        };
      }
      return { status: 'ok', result: {} };
    });
    taskRepo.count.mockResolvedValue(3);
    taskRepo.find.mockResolvedValue([]);
    kbRepo.count.mockResolvedValue(2);
    logRepo.count.mockResolvedValue(10);
    tenantRepo.findAll.mockResolvedValue([]);
    service = new SystemService(
      settings as never,
      ovClient as never,
      taskRepo as never,
      kbRepo as never,
      logRepo as never,
      tenantRepo as never,
    );
  });

  it('租户看板应使用租户有效 OV 配置', async () => {
    await service.getDashboardStats('tenant-1');

    expect(settings.resolveOVConfig).toHaveBeenCalledWith('tenant-1');
    expect(ovClient.request).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: 'http://ov.default',
        apiKey: 'default-key',
      }),
      '/api/v1/observer/queue',
    );
  });

  it('平台看板应按活跃租户配置去重聚合 OV 数据', async () => {
    tenantRepo.findAll.mockResolvedValue([
      { id: 'tenant-1', status: 'active' },
      { id: 'tenant-2', status: 'active' },
      { id: 'tenant-disabled', status: 'disabled' },
    ]);
    settings.resolveOVConfig.mockImplementation(async (tenantId: string) => ({
      baseUrl:
        tenantId === 'tenant-2' ? 'http://ov.tenant-2' : 'http://ov.shared',
      apiKey: tenantId === 'tenant-2' ? 'tenant-2-key' : 'shared-key',
      account: 'default',
    }));
    // 按 path 分发 mock，避免 Promise.allSettled 并发导致的顺序问题
    ovClient.request.mockImplementation(async (_conn: { baseUrl: string }, path: string) => {
      if (path === '/api/v1/observer/queue') {
        const queueData = _conn.baseUrl === 'http://ov.tenant-2'
          ? { Embedding: 3, Semantic: 0, 'Semantic-Nodes': 0 }
          : { Embedding: 2, Semantic: 1, 'Semantic-Nodes': 0 };
        return {
          status: 'ok',
          result: {
            status: [
              '+----------------+---------+-------------+',
              '|     Queue      | Pending | In Progress |',
              '+----------------+---------+-------------+',
              `|   Embedding    |    ${queueData.Embedding}    |      0      |`,
              `|    Semantic    |    ${queueData.Semantic}    |      0      |`,
              `| Semantic-Nodes |    ${queueData['Semantic-Nodes']}    |      0      |`,
              '|     TOTAL      |    3    |      0      |',
              '+----------------+---------+-------------+',
            ].join('\n'),
          },
        };
      }
      return {
        status: 'ok',
        result: {
          status: [
            '+------------+-------------+--------------+--------+',
            '| Collection | Index Count | Vector Count | Status |',
            '+------------+-------------+--------------+--------+',
            '|  context   |      1      |     4032     |   OK   |',
            '|   TOTAL    |      1      |     4032     |        |',
            '+------------+-------------+--------------+--------+',
          ].join('\n'),
        },
      };
    });

    const stats = await service.getDashboardStats(null);

    expect(stats.tenantCount).toBe(2);
    expect(settings.resolveOVConfig).toHaveBeenCalledTimes(2);
    expect(ovClient.getHealth).toHaveBeenCalledTimes(2);
    expect(stats.health).toEqual({
      ok: true,
      message: 'OpenViking 配置 2/2 可用',
    });
    expect(stats.queue).toEqual({ Embedding: 5, Semantic: 1, 'Semantic-Nodes': 0 });
  });

  it('平台看板无租户时应保留默认 OV 检查但租户数为 0', async () => {
    const stats = await service.getDashboardStats(null);

    expect(stats.tenantCount).toBe(0);
    expect(settings.resolveOVConfig).toHaveBeenCalledWith(null);
    expect(ovClient.getHealth).toHaveBeenCalledWith('http://ov.default');
  });
});
