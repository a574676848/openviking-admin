import { SearchService } from './search.service';

describe('SearchService', () => {
  const logRepo = {
    save: jest.fn(),
    find: jest.fn(),
    count: jest.fn(),
    getStats: jest.fn(),
    getFeedbackStats: jest.fn(),
    getTopUris: jest.fn(),
    getTopQueries: jest.fn(),
    getDailyStats: jest.fn(),
  };
  const nodeRepo = {
    findAllowedUris: jest.fn(),
  };
  const settings = {
    resolveOVConfig: jest.fn(),
  };
  const ovKnowledgeGateway = {
    findKnowledge: jest.fn(),
    grepKnowledge: jest.fn(),
    rerank: jest.fn(),
  };

  let service: SearchService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SearchService(
      logRepo as never,
      nodeRepo as never,
      settings as never,
      ovKnowledgeGateway as never,
    );
    nodeRepo.findAllowedUris.mockResolvedValue(['viking://resources/default/']);
    logRepo.save.mockImplementation(async (payload: Record<string, unknown>) => ({
      id: 'log-1',
      ...payload,
    }));
  });

  it('关闭 rerank 时保留基础召回并返回日志标识', async () => {
    settings.resolveOVConfig.mockResolvedValue({
      baseUrl: 'http://ov.local',
      apiKey: 'key',
      account: 'default',
      rerankEndpoint: 'http://rerank.local',
      rerankApiKey: 'rerank-key',
      rerankModel: 'test-model',
    });
    ovKnowledgeGateway.findKnowledge.mockResolvedValue({
      result: {
        resources: [{ uri: 'viking://a', score: 0.61, content: 'WebDAV 配置说明' }],
      },
    });

    const result = await service.find(
      {
        query: 'WebDAV 配置',
        topK: 4,
        scoreThreshold: 0.2,
        useRerank: false,
      },
      'tenant-a',
      { id: 'user-1', role: 'tenant_admin' },
    );

    expect(ovKnowledgeGateway.findKnowledge).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        topK: 4,
        scoreThreshold: 0.2,
      }),
      undefined,
    );
    expect(ovKnowledgeGateway.rerank).not.toHaveBeenCalled();
    expect(logRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        meta: { rerank_applied: false },
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        logId: 'log-1',
        rerankApplied: false,
      }),
    );
  });

  it('启用 rerank 时返回重排后的结果', async () => {
    settings.resolveOVConfig.mockResolvedValue({
      baseUrl: 'http://ov.local',
      apiKey: 'key',
      account: 'default',
      rerankEndpoint: 'http://rerank.local',
      rerankApiKey: 'rerank-key',
      rerankModel: 'test-model',
    });
    ovKnowledgeGateway.findKnowledge.mockResolvedValue({
      result: {
        resources: [
          { uri: 'viking://a', score: 0.61, content: 'A' },
          { uri: 'viking://b', score: 0.58, content: 'B' },
        ],
      },
    });
    ovKnowledgeGateway.rerank.mockResolvedValue({
        results: [
          { index: 0, relevance_score: 0.4 },
          { index: 1, relevance_score: 0.9 },
        ],
    });

    const result = await service.find(
      {
        query: '配置说明',
        topK: 2,
        useRerank: true,
      },
      'tenant-a',
      { id: 'user-1', role: 'tenant_admin' },
    );

    expect(ovKnowledgeGateway.findKnowledge).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        topK: 20,
      }),
      undefined,
    );
    expect(ovKnowledgeGateway.rerank).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: 'http://rerank.local',
        apiKey: 'rerank-key',
        query: '配置说明',
        model: 'test-model',
      }),
      undefined,
    );
    expect(result).toEqual(
      expect.objectContaining({
        rerankApplied: true,
        logId: 'log-1',
      }),
    );
    expect(result.resources?.[0]).toEqual(
      expect.objectContaining({
        uri: 'viking://b',
        stage1Score: 0.58,
        score: 0.9,
        reranked: true,
      }),
    );
  });

  it('应透传 trace 元信息给搜索与 rerank client', async () => {
    settings.resolveOVConfig.mockResolvedValue({
      baseUrl: 'http://ov.local',
      apiKey: 'key',
      account: 'default',
      rerankEndpoint: 'http://rerank.local',
      rerankApiKey: 'rerank-key',
      rerankModel: 'test-model',
    });
    ovKnowledgeGateway.findKnowledge.mockResolvedValue({
      result: {
        resources: [{ uri: 'viking://a', score: 0.61, content: 'A' }],
      },
    });
    ovKnowledgeGateway.rerank.mockResolvedValue({
      results: [{ index: 0, relevance_score: 0.88 }],
    });

    await service.find(
      {
        query: 'trace',
        useRerank: true,
      },
      'tenant-a',
      { id: 'user-1', role: 'tenant_admin' },
      {
        traceId: 'trace-1',
        requestId: 'request-1',
        user: 'user-1',
      },
    );

    expect(ovKnowledgeGateway.findKnowledge).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      {
        traceId: 'trace-1',
        requestId: 'request-1',
        user: 'user-1',
      },
    );
    expect(ovKnowledgeGateway.rerank).toHaveBeenCalledWith(
      expect.anything(),
      {
        traceId: 'trace-1',
        requestId: 'request-1',
        user: 'user-1',
      },
    );
  });

  it('rerank 失败时应回退到 stage1 结果', async () => {
    settings.resolveOVConfig.mockResolvedValue({
      baseUrl: 'http://ov.local',
      apiKey: 'key',
      account: 'default',
      rerankEndpoint: 'http://rerank.local',
      rerankApiKey: 'rerank-key',
      rerankModel: 'test-model',
    });
    ovKnowledgeGateway.findKnowledge.mockResolvedValue({
      result: {
        resources: [{ uri: 'viking://a', score: 0.61, content: 'A' }],
      },
    });
    ovKnowledgeGateway.rerank.mockRejectedValue(new Error('timeout'));

    const result = await service.find(
      {
        query: 'fallback',
        topK: 1,
        useRerank: true,
      },
      'tenant-a',
      { id: 'user-1', role: 'tenant_admin' },
    );

    expect(result.resources).toEqual([
      expect.objectContaining({
        uri: 'viking://a',
        score: 0.61,
      }),
    ]);
    expect(logRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        resultCount: 1,
      }),
    );
  });

  it('空结果时应写入 resultCount=0 并返回空数组', async () => {
    settings.resolveOVConfig.mockResolvedValue({
      baseUrl: 'http://ov.local',
      apiKey: 'key',
      account: 'default',
      rerankEndpoint: null,
      rerankApiKey: null,
      rerankModel: null,
    });
    ovKnowledgeGateway.findKnowledge.mockResolvedValue({
      result: {
        resources: [],
      },
    });

    const result = await service.find(
      {
        query: 'no-hit',
        useRerank: false,
      },
      'tenant-a',
      { id: 'user-1', role: 'tenant_admin' },
    );

    expect(result.resources).toEqual([]);
    expect(logRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        resultCount: 0,
        scoreMax: 0,
      }),
    );
  });

  it('下游搜索失败时应向上抛出统一异常', async () => {
    settings.resolveOVConfig.mockResolvedValue({
      baseUrl: 'http://ov.local',
      apiKey: 'key',
      account: 'default',
      rerankEndpoint: null,
      rerankApiKey: null,
      rerankModel: null,
    });
    ovKnowledgeGateway.findKnowledge.mockRejectedValue(
      new Error('OpenViking Search 暂时不可用'),
    );

    await expect(
      service.find(
        {
          query: 'downstream-error',
          useRerank: false,
        },
        'tenant-a',
        { id: 'user-1', role: 'tenant_admin' },
      ),
    ).rejects.toThrow('OpenViking Search 暂时不可用');
  });

  it('多模态资源应以图文混合文档传给 rerank', async () => {
    settings.resolveOVConfig.mockResolvedValue({
      baseUrl: 'http://ov.local',
      apiKey: 'key',
      account: 'default',
      rerankEndpoint: 'http://rerank.local/v1',
      rerankApiKey: 'rerank-key',
      rerankModel: 'qwen3-vl-rerank',
    });
    ovKnowledgeGateway.findKnowledge.mockResolvedValue({
      result: {
        resources: [
          {
            uri: 'viking://a',
            score: 0.61,
            title: '封面图',
            abstract: '图像说明',
            image_url: 'https://example.com/a.png',
            video_url: 'https://example.com/a.mp4',
          },
        ],
      },
    });
    ovKnowledgeGateway.rerank.mockResolvedValue({
      results: [{ index: 0, score: 0.95 }],
    });

    const result = await service.find(
      {
        query: '看图找答案',
        topK: 1,
        useRerank: true,
      },
      'tenant-a',
      { id: 'user-1', role: 'tenant_admin' },
    );

    expect(ovKnowledgeGateway.rerank).toHaveBeenCalledWith(
      expect.objectContaining({
        documents: [
          {
            text: '封面图\n\n图像说明',
            image: 'https://example.com/a.png',
            video: 'https://example.com/a.mp4',
          },
        ],
      }),
      undefined,
    );
    expect(result.resources?.[0]).toEqual(
      expect.objectContaining({
        score: 0.95,
      }),
    );
  });
});
