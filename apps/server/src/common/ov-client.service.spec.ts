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
        headers: {
          get: () => 'application/json; charset=utf-8',
        },
        text: async () => JSON.stringify({ result: { ok: true } }),
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
          'X-OpenViking-Account': 'default',
          'x-trace-id': 'trace-1',
          'x-request-id': 'request-1',
        }),
      }),
    );
  });

  it('请求级元信息不应覆盖后端配置的 OpenViking 账号', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      headers: {
        get: () => 'application/json; charset=utf-8',
      },
      text: async () => JSON.stringify({ result: { ok: true } }),
      json: async () => ({ result: { ok: true } }),
    });

    await service.request(
      { baseUrl: 'http://ov.local', apiKey: 'key', account: 'default' },
      '/api/v1/search/find',
      'POST',
      { query: 'tenant' },
      {
        user: 'user-1',
      },
      { serviceLabel: 'OpenViking Search' },
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'http://ov.local/api/v1/search/find',
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-OpenViking-Account': 'default',
          'X-OpenViking-User': 'user-1',
        }),
      }),
    );
  });

  it('上传临时文件时应使用 multipart 且不手动设置 JSON Content-Type', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      headers: {
        get: () => 'application/json; charset=utf-8',
      },
      text: async () =>
        JSON.stringify({ result: { temp_file_id: 'upload_guide.md' } }),
    });

    const result = await service.uploadTempFile(
      { baseUrl: 'http://ov.local', apiKey: 'key', account: 'default' },
      '/api/v1/resources/temp_upload',
      {
        fileName: 'guide.md',
        buffer: Buffer.from('# Guide'),
        mimeType: 'text/markdown',
      },
      {
        user: 'user-1',
      },
      { serviceLabel: 'OpenViking Resources' },
    );

    expect(result).toEqual({ result: { temp_file_id: 'upload_guide.md' } });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://ov.local/api/v1/resources/temp_upload',
      expect.objectContaining({
        method: 'POST',
        body: expect.any(FormData),
        headers: expect.objectContaining({
          'x-api-key': 'key',
          'X-OpenViking-Account': 'default',
          'X-OpenViking-User': 'user-1',
        }),
      }),
    );
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers).not.toHaveProperty('Content-Type');
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

  it('200 但返回 HTML 时应抛出非 JSON 响应异常', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      headers: {
        get: () => 'text/html; charset=utf-8',
      },
      text: async () => '<!doctype html><html><body>gateway</body></html>',
    });

    await expect(
      service.requestExternal(
        'http://rerank.local',
        'POST',
        { query: 'tenant' },
        undefined,
        { retryCount: 0, serviceLabel: 'Rerank' },
      ),
    ).rejects.toMatchObject<Partial<OpenVikingRequestException>>({
      statusCode: HttpStatus.BAD_GATEWAY,
      retriable: false,
    });
  });
});
