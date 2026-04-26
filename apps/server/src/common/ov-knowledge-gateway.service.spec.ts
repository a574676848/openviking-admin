import { OVKnowledgeGatewayService } from './ov-knowledge-gateway.service';

describe('OVKnowledgeGatewayService', () => {
  const ovClient = {
    request: jest.fn(),
    requestExternal: jest.fn(),
  };

  let service: OVKnowledgeGatewayService;

  beforeEach(() => {
    jest.clearAllMocks();
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

  it('rerank 应统一注入 timeout、retry 与 serviceLabel', async () => {
    ovClient.requestExternal.mockResolvedValue({ results: [] });

    await service.rerank(
      {
        endpoint: 'http://rerank.local',
        query: 'tenant',
        documents: ['A'],
        model: 'rerank-v1',
      },
      { traceId: 'trace-1' },
    );

    expect(ovClient.requestExternal).toHaveBeenCalledWith(
      'http://rerank.local',
      'POST',
      expect.objectContaining({
        query: 'tenant',
        model: 'rerank-v1',
      }),
      { traceId: 'trace-1' },
      expect.objectContaining({
        timeoutMs: 1500,
        retryCount: 1,
        serviceLabel: 'Rerank',
      }),
    );
  });
});
