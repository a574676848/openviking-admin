import { SettingsService } from './settings.service';

describe('SettingsService', () => {
  const configRows = new Map<string, string>();
  const repo = {
    findOne: jest.fn(async ({ where }: { where: { key: string } }) => {
      const value = configRows.get(where.key);
      return value === undefined ? null : { key: where.key, value };
    }),
    save: jest.fn(),
    find: jest.fn(),
  };
  const tenantRepo = {
    findById: jest.fn(),
    findByTenantId: jest.fn(),
  };
  const auditService = {
    log: jest.fn(),
  };
  const encryptionService = {
    decrypt: jest.fn((value: string) => {
      if (value === 'encrypted-default') {
        return JSON.stringify({
          baseUrl: 'http://ov.default',
          apiKey: 'default-key',
          account: 'default-account',
          rerankApiKey: 'default-rerank-key',
        });
      }
      if (value === 'encrypted-tenant-key') return 'tenant-key';
      if (value === 'encrypted-rerank-tenant-key') return 'tenant-rerank-key';
      return value;
    }),
    encrypt: jest.fn((value: string) => value),
  };
  const configService = {
    get: jest.fn(),
  };
  const ovClient = {
    getHealth: jest.fn(),
    requestExternal: jest.fn(),
  };

  let service: SettingsService;

  beforeEach(() => {
    jest.clearAllMocks();
    configRows.clear();
    tenantRepo.findById.mockResolvedValue(null);
    tenantRepo.findByTenantId.mockResolvedValue(null);
    configService.get.mockReturnValue(undefined);
    service = new SettingsService(
      repo as never,
      tenantRepo as never,
      auditService as never,
      encryptionService as never,
      configService as never,
      ovClient as never,
    );
  });

  it('应优先读取数据库默认 OV 配置', async () => {
    configRows.set('DEFAULT_OV_CONFIG', 'encrypted-default');
    configRows.set('ov.base_url', 'http://ov.legacy');
    configRows.set('ov.api_key', 'legacy-key');
    configRows.set('ov.account', 'legacy-account');

    const config = await service.resolveOVConfig();

    expect(config).toEqual(
      expect.objectContaining({
        baseUrl: 'http://ov.default',
        apiKey: 'default-key',
        account: 'default-account',
      }),
    );
  });

  it('租户自定义配置应覆盖默认配置并解密 apiKey', async () => {
    configRows.set('DEFAULT_OV_CONFIG', 'encrypted-default');
    tenantRepo.findById.mockResolvedValue({
      id: 'tenant-1',
      tenantId: 'acme',
      vikingAccount: 'tenant-account',
      ovConfig: {
        baseUrl: 'http://ov.tenant',
        apiKey: 'encrypted-tenant-key',
        rerankApiKey: 'encrypted-rerank-tenant-key',
      },
    });

    const config = await service.resolveOVConfig('tenant-1');

    expect(config).toEqual(
      expect.objectContaining({
        baseUrl: 'http://ov.tenant',
        apiKey: 'tenant-key',
        account: 'tenant-account',
        rerankApiKey: 'tenant-rerank-key',
      }),
    );
  });

  it('租户没有自定义配置时应回退默认配置', async () => {
    configRows.set('DEFAULT_OV_CONFIG', 'encrypted-default');
    tenantRepo.findByTenantId.mockResolvedValue({
      id: 'tenant-1',
      tenantId: 'acme',
      vikingAccount: null,
      ovConfig: null,
    });

    const config = await service.resolveOVConfig('acme');

    expect(config).toEqual(
      expect.objectContaining({
        baseUrl: 'http://ov.default',
        apiKey: 'default-key',
        account: 'default-account',
      }),
    );
  });

  it('数据库没有默认 OV 配置时应回退读取环境配置', async () => {
    configService.get.mockImplementation((key: string) => {
      const values: Record<string, string> = {
        OV_BASE_URL: 'http://ov.env',
        OV_API_KEY: 'env-key',
        OV_ACCOUNT: 'env-account',
        RERANK_ENDPOINT: 'http://rerank.env/rerank',
        RERANK_API_KEY: 'env-rerank-key',
        RERANK_MODEL: 'env-rerank-model',
      };
      return values[key];
    });

    const config = await service.resolveOVConfig();

    expect(config).toEqual({
      baseUrl: 'http://ov.env',
      apiKey: 'env-key',
      account: 'env-account',
      rerankEndpoint: 'http://rerank.env/rerank',
      rerankApiKey: 'env-rerank-key',
      rerankModel: 'env-rerank-model',
    });
  });

  it('数据库默认 OV 配置字段为空时应使用环境配置补齐', async () => {
    configRows.set(
      'DEFAULT_OV_CONFIG',
      JSON.stringify({ baseUrl: 'http://ov.default' }),
    );
    configService.get.mockImplementation((key: string) => {
      const values: Record<string, string> = {
        OV_API_KEY: 'env-key',
        OV_ACCOUNT: 'env-account',
      };
      return values[key];
    });

    const config = await service.resolveOVConfig();

    expect(config).toEqual(
      expect.objectContaining({
        baseUrl: 'http://ov.default',
        apiKey: 'env-key',
        account: 'env-account',
      }),
    );
  });

  it('测试核心引擎连接成功时应返回健康检查目标地址', async () => {
    ovClient.getHealth.mockResolvedValue({ ok: true });

    await expect(
      service.testConnection({
        type: 'engine',
        baseUrl: 'http://ov.default',
      }),
    ).resolves.toEqual({
      ok: true,
      type: 'engine',
      message: '核心引擎连接成功',
      target: 'http://ov.default/health',
    });
  });

  it('测试 Rerank 连接时应优先调用 /v1/rerank 接口', async () => {
    ovClient.requestExternal.mockResolvedValue({ results: [] });

    await expect(
      service.testConnection({
        type: 'rerank',
        endpoint: 'http://rerank.local/v1',
        apiKey: 'rerank-key',
        model: 'bge-reranker-v2-m3',
      }),
    ).resolves.toEqual({
      ok: true,
      type: 'rerank',
      message: 'Rerank 接口连接成功',
      target: 'http://rerank.local/v1/rerank',
    });

    expect(ovClient.requestExternal).toHaveBeenCalledWith(
      'http://rerank.local/v1/rerank',
      'POST',
      expect.objectContaining({
        model: 'bge-reranker-v2-m3',
        query: '连通性测试',
      }),
      undefined,
      expect.objectContaining({
        headers: {
          Authorization: 'Bearer rerank-key',
        },
        serviceLabel: 'Rerank Test',
      }),
    );
  });
});
