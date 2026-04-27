import {
  OpenVikingRequestException,
} from './ov-client.service';
import { OVKnowledgeGatewayService } from './ov-knowledge-gateway.service';

describe('OVKnowledgeGatewayService', () => {
  const ovClient = {
    request: jest.fn(),
    requestExternal: jest.fn(),
  };

  let service: OVKnowledgeGatewayService;

  beforeEach(() => {
    jest.clearAllMocks();
    ovClient.requestExternal.mockResolvedValue({ results: [] });
    service = new OVKnowledgeGatewayService(ovClient as never);
  });

  it('findKnowledge 应统一注入 timeout、retry 与 serviceLabel', async () => {
    ovClient.request.mockResolvedValue({ result: { resources: [] } });

    await service.findKnowledge(
      { baseUrl: 'http://ov.local' },
      {
        query: 'tenant',
        topK: 5,
        scoreThreshold: 0.3,
        filterUris: ['viking://tenant-a/'],
      },
      { traceId: 'trace-1', requestId: 'request-1' },
    );

    expect(ovClient.request).toHaveBeenCalledWith(
      { baseUrl: 'http://ov.local' },
      '/api/v1/search/find',
      'POST',
      expect.objectContaining({
        top_k: 5,
        score_threshold: 0.3,
      }),
      { traceId: 'trace-1', requestId: 'request-1' },
      expect.objectContaining({
        timeoutMs: 2500,
        retryCount: 1,
        serviceLabel: 'OpenViking Search',
      }),
    );
  });

  it('rerank 应优先命中 /v1/rerank 并透传 headers', async () => {
    await service.rerank(
      {
        endpoint: 'http://rerank.local',
        apiKey: 'rerank-key',
        query: 'tenant',
        documents: ['A'],
        model: 'rerank-v1',
      },
      { traceId: 'trace-1', requestId: 'request-1' },
    );

    expect(ovClient.requestExternal).toHaveBeenCalledWith(
      'http://rerank.local/v1/rerank',
      'POST',
      expect.objectContaining({
        query: 'tenant',
        model: 'rerank-v1',
        documents: ['A'],
      }),
      { traceId: 'trace-1', requestId: 'request-1' },
      expect.objectContaining({
        headers: {
          Authorization: 'Bearer rerank-key',
        },
        timeoutMs: 1500,
        retryCount: 1,
        serviceLabel: 'Rerank',
      }),
    );
  });

  it('兼容 data.results 响应结构', async () => {
    ovClient.requestExternal.mockResolvedValue({
      data: {
        results: [{ index: 0, relevance_score: 0.91 }],
      },
    });

    const result = await service.rerank({
      endpoint: 'http://rerank.local/v1',
      query: 'tenant',
      documents: ['A'],
    });

    expect(result).toEqual(
      expect.objectContaining({
        results: [{ index: 0, relevance_score: 0.91 }],
      }),
    );
  });

  it('当 /v1/rerank 返回 404 时应回退尝试 /v1/reranks', async () => {
    ovClient.requestExternal
      .mockRejectedValueOnce(
        new OpenVikingRequestException(
          'Rerank',
          false,
          404,
          undefined,
          undefined,
          { code: 'NOT_FOUND', message: 'not found' },
        ),
      )
      .mockResolvedValueOnce({ results: [] });

    await service.rerank({
      endpoint: 'http://rerank.local/v1',
      query: 'tenant',
      documents: ['A'],
    });

    expect(ovClient.requestExternal).toHaveBeenNthCalledWith(
      1,
      'http://rerank.local/v1/rerank',
      'POST',
      expect.anything(),
      undefined,
      expect.anything(),
    );
    expect(ovClient.requestExternal).toHaveBeenNthCalledWith(
      2,
      'http://rerank.local/v1/reranks',
      'POST',
      expect.anything(),
      undefined,
      expect.anything(),
    );
  });
});
