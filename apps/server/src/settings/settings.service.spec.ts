import { SettingsService } from './settings.service';

describe('SettingsService', () => {
  const repo = {
    findOne: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
  };
  const auditService = {
    log: jest.fn(),
  };
  const encryptionService = {
    decrypt: jest.fn((value: string) => value),
    encrypt: jest.fn((value: string) => value),
  };
  const ovClient = {
    getHealth: jest.fn(),
    requestExternal: jest.fn(),
  };
  const ovConfigResolver = {
    resolve: jest.fn(),
  };

  let service: SettingsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SettingsService(
      repo as never,
      auditService as never,
      encryptionService as never,
      ovClient as never,
      ovConfigResolver as never,
    );
  });

  it('应把 OV 配置解析委托给共享解析器', async () => {
    ovConfigResolver.resolve.mockResolvedValue({
      baseUrl: 'http://ov.default',
      apiKey: 'default-key',
      account: 'default-account',
      user: 'default-user',
      rerankEndpoint: null,
      rerankApiKey: null,
      rerankModel: null,
    });

    await expect(service.resolveOVConfig('tenant-1')).resolves.toEqual(
      expect.objectContaining({
        baseUrl: 'http://ov.default',
        account: 'default-account',
      }),
    );
    expect(ovConfigResolver.resolve).toHaveBeenCalledWith('tenant-1');
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
