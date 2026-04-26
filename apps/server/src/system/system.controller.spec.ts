import { SystemController } from './system.controller';
import type { AuthenticatedRequest } from '../common/authenticated-request.interface';

describe('SystemController', () => {
  const settings = {
    resolveOVConfig: jest.fn(),
  };
  const ovClient = {
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
  const controller = new SystemController(
    settings as never,
    ovClient as never,
    systemService as never,
    dynamicDS as never,
    auditService as never,
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
