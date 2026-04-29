import { SystemController } from './system.controller';
import type { AuthenticatedRequest } from '../common/authenticated-request.interface';

describe('SystemController', () => {
  const settings = {
    resolveOVConfig: jest.fn(),
  };
  const ovClient = {
    getHealth: jest.fn(),
    request: jest.fn(),
  };
  const systemService = {
    getDashboardStats: jest.fn(),
  };
  const dynamicDS = {
    getPoolStatus: jest.fn(),
  };
  const auditService = {
    log: jest.fn(),
  };
  const tenantRepo = {
    findByTenantId: jest.fn(),
    findById: jest.fn(),
  };
  const controller = new SystemController(
    settings as never,
    ovClient as never,
    systemService as never,
    dynamicDS as never,
    auditService as never,
    tenantRepo as never,
  );
  const req = {
    tenantScope: 'tenant-alpha',
    user: { id: 'user-1', username: 'alice' },
    headers: { 'x-request-id': 'request-1' },
    ip: '127.0.0.1',
  } as unknown as AuthenticatedRequest;

  beforeEach(() => {
    jest.clearAllMocks();
    settings.resolveOVConfig.mockResolvedValue({
      baseUrl: 'http://ov.test',
      apiKey: 'secret',
      account: 'default',
    });
    ovClient.getHealth.mockResolvedValue({ status: 'ok' });
    dynamicDS.getPoolStatus.mockReturnValue({ activeTenants: 3 });
    tenantRepo.findByTenantId.mockResolvedValue({
      id: 'tenant-record-1',
      tenantId: 'tenant-alpha',
      ovConfig: {
        baseUrl: 'http://tenant-ov.local',
      },
    });
  });

  it('租户启用自定义 OV 后 health 应返回完整遥测', async () => {
    const result = await controller.health(req);

    expect(result).toEqual({
      ok: true,
      openviking: { status: 'ok' },
      resolvedBaseUrl: 'http://ov.test',
      dbPool: { activeTenants: 3 },
    });
    expect(dynamicDS.getPoolStatus).toHaveBeenCalled();
  });

  it('租户启用自定义 OV 后 stats 应返回真实明细', async () => {
    ovClient.request
      .mockResolvedValueOnce({
        result: {
          status: '| Queue | Pending |\n| Embedding | 2 |\n| TOTAL | 2 |',
        },
      })
      .mockResolvedValueOnce({
        result: {
          status:
            '| Collection | Index Count | Vector Count | Status |\n| context | 1 | 32 | OK |\n| TOTAL | 1 | 32 | OK |',
        },
      });

    const result = await controller.stats(req);

    expect(result).toEqual(
      expect.objectContaining({
        queue: { Embedding: 2 },
        vikingdb: expect.objectContaining({
          totalCollections: 1,
          totalIndexCount: 1,
          totalVectorCount: 32,
        }),
      }),
    );
  });

  it('未启用自定义 OV 的租户访问系统状态应被拒绝', async () => {
    tenantRepo.findByTenantId.mockResolvedValueOnce({
      id: 'tenant-record-1',
      tenantId: 'tenant-alpha',
      ovConfig: null,
    });

    await expect(controller.health(req)).rejects.toThrow(
      '当前租户未启用自定义 OpenViking 引擎配置，不能访问系统状态。',
    );
  });

  it('reindex 成功后应写入审计日志', async () => {
    ovClient.request.mockResolvedValue({ queued: true });

    await controller.reindex({ uri: 'viking://docs/a' }, req);

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'reindex_resource',
        target: 'viking://docs/a',
        tenantId: 'tenant-alpha',
      }),
    );
  });
});
