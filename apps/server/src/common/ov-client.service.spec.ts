import { HttpStatus } from '@nestjs/common';
import {
  OpenVikingRequestException,
  OVClientService,
} from './ov-client.service';

describe('OVClientService', () => {
  const fetchMock = jest.fn();
  let service: OVClientService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new OVClientService();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('遇到可重试的 503 时应重试并最终成功', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        text: async () => 'temporarily unavailable',
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: { ok: true } }),
      });

    const result = await service.request(
      { baseUrl: 'http://ov.local', apiKey: 'key', account: 'default' },
      '/api/v1/search/find',
      'POST',
      { query: 'tenant' },
      { traceId: 'trace-1', requestId: 'request-1' },
      { retryCount: 1, retryDelayMs: 0, serviceLabel: 'OpenViking Search' },
    );

    expect(result).toEqual({ result: { ok: true } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenLastCalledWith(
      'http://ov.local/api/v1/search/find',
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-trace-id': 'trace-1',
          'x-request-id': 'request-1',
        }),
      }),
    );
  });

  it('403 应映射为不可重试异常', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => 'scope denied',
    });

    await expect(
      service.request(
        { baseUrl: 'http://ov.local' },
        '/api/v1/fs/ls',
        'GET',
        undefined,
        undefined,
        { retryCount: 1, retryDelayMs: 0, serviceLabel: 'OpenViking Resources' },
      ),
    ).rejects.toMatchObject<Partial<OpenVikingRequestException>>({
      statusCode: HttpStatus.FORBIDDEN,
      retriable: false,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('AbortError 应映射为超时异常', async () => {
    const abortError = Object.assign(new Error('aborted'), {
      name: 'AbortError',
    });
    fetchMock.mockRejectedValue(abortError);

    await expect(
      service.requestExternal(
        'http://rerank.local',
        'POST',
        { query: 'tenant' },
        undefined,
        { retryCount: 0, timeoutMs: 10, serviceLabel: 'Rerank' },
      ),
    ).rejects.toMatchObject<Partial<OpenVikingRequestException>>({
      statusCode: HttpStatus.GATEWAY_TIMEOUT,
      retriable: true,
    });
  });
});
