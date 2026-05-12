import type { Request } from 'express';
import { WebdavService } from './webdav.service';

describe('WebdavService 日志', () => {
  type LoggerStub = {
    warn: jest.Mock;
    error: jest.Mock;
  };

  function createService(overrides: Record<string, unknown> = {}) {
    const capabilityCredentialService = {
      resolvePrincipalFromApiKey: jest.fn(),
      ...overrides,
    };
    const tenantCacheService = {
      getIsolationConfigByTenantRecordId: jest.fn(
        async (identifier: string) => ({
          tenantId: identifier,
          level: 'small',
        }),
      ),
    };
    const service = new WebdavService(
      capabilityCredentialService as never,
      tenantCacheService as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const logger: LoggerStub = {
      warn: jest.fn(),
      error: jest.fn(),
    };
    (service as unknown as { logger: LoggerStub }).logger = logger;

    return { service, logger, capabilityCredentialService };
  }

  function createRequest(headers: Record<string, string | undefined> = {}) {
    const normalizedHeaders = Object.fromEntries(
      Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
    );

    return {
      method: 'PROPFIND',
      header: (name: string) => normalizedHeaders[name.toLowerCase()],
    } as Request;
  }

  it('缺少 Basic Authorization 时应记录 WebDAV 鉴权失败原因', async () => {
    const { service, logger } = createService();

    const response = await service.buildResponse(createRequest(), 'tenant-a');

    expect(response.status).toBe(401);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('missing_basic_authorization'),
    );
  });

  it('凭证解析异常时应记录脱敏后的 WebDAV 失败原因', async () => {
    const { service, logger } = createService({
      resolvePrincipalFromApiKey: jest.fn(async () => {
        throw new Error('凭证不可用');
      }),
    });

    const response = await service.buildResponse(
      createRequest({
        Authorization:
          'Basic ' + Buffer.from('tenant-a:secret-value').toString('base64'),
      }),
      'tenant-a',
    );

    expect(response.status).toBe(401);
    expect(logger.error.mock.calls[0][0]).toContain(
      'credential_resolve_failed',
    );
    expect(logger.error.mock.calls[0][0]).not.toContain('secret-value');
  });
});
