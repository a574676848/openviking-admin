import { of, lastValueFrom } from 'rxjs';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { SuccessResponseInterceptor } from './success-response.interceptor';

function createHttpContext(url: string) {
  const request = {
    url,
    originalUrl: url,
    headers: {},
  };
  const headers = new Map<string, string>();
  const response = {
    setHeader: jest.fn((key: string, value: string) => headers.set(key, value)),
    getHeader: jest.fn((key: string) => headers.get(key)),
  };

  return {
    request,
    response,
    context: {
      getType: () => 'http',
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as unknown as ExecutionContext,
  };
}

describe('SuccessResponseInterceptor', () => {
  const interceptor = new SuccessResponseInterceptor();

  it('应该为普通 JSON 成功响应补齐 envelope', async () => {
    const { context, response } = createHttpContext('/api/v1/system/health');
    const next: CallHandler = {
      handle: () => of({ ok: true }),
    };

    const result = await lastValueFrom(interceptor.intercept(context, next));

    expect(result).toEqual(
      expect.objectContaining({
        data: { ok: true },
        error: null,
      }),
    );
    expect((result as { meta: { version: string } }).meta.version).toBe('v1');
    expect(response.setHeader).toHaveBeenCalledWith(
      'x-request-id',
      expect.any(String),
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      'x-trace-id',
      expect.any(String),
    );
  });

  it('应该跳过已是 envelope 的响应', async () => {
    const { context } = createHttpContext('/api/v1/capabilities');
    const payload = {
      data: { items: [] },
      meta: { requestId: 'request-1' },
      traceId: 'trace-1',
      error: null,
    };
    const next: CallHandler = {
      handle: () => of(payload),
    };

    const result = await lastValueFrom(interceptor.intercept(context, next));

    expect(result).toBe(payload);
  });

  it('应该跳过 MCP SSE 路径', async () => {
    const { context } = createHttpContext('/api/v1/mcp/sse');
    const payload = { data: '{"jsonrpc":"2.0"}', type: 'message' };
    const next: CallHandler = {
      handle: () => of(payload),
    };

    const result = await lastValueFrom(interceptor.intercept(context, next));

    expect(result).toBe(payload);
  });

  it('应该跳过 WebDAV XML 响应', async () => {
    const { context, response } = createHttpContext('/webdav/tenant-a/');
    response.setHeader('content-type', 'application/xml; charset=utf-8');
    const payload = '<?xml version="1.0" encoding="utf-8"?><D:multistatus />';
    const next: CallHandler = {
      handle: () => of(payload),
    };

    const result = await lastValueFrom(interceptor.intercept(context, next));

    expect(result).toBe(payload);
  });
});
