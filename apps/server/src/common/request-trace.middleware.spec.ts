import type { NextFunction, Request, Response } from 'express';
import { RequestTraceMiddleware } from './request-trace.middleware';

describe('RequestTraceMiddleware', () => {
  const originalVerboseFlag = process.env.WEBDAV_ACCESS_LOG_VERBOSE;

  let middleware: RequestTraceMiddleware;
  let finishHandler: (() => void) | undefined;
  let logger: {
    log: jest.Mock;
    warn: jest.Mock;
    error: jest.Mock;
  };
  type ResponseStub = Pick<
    Response,
    'statusCode' | 'on' | 'getHeader' | 'setHeader' | 'getHeaders'
  >;

  function createRequest(overrides: Partial<Request> = {}) {
    return {
      method: 'DELETE',
      originalUrl:
        '/webdav/tenant-a/%E7%9F%A5%E8%AF%86%E5%BA%93%E4%B8%80/%E8%AF%B4%E6%98%8E.md',
      url: '/webdav/tenant-a/%E7%9F%A5%E8%AF%86%E5%BA%93%E4%B8%80/%E8%AF%B4%E6%98%8E.md',
      headers: {
        authorization: 'Basic secret-value',
        depth: '1',
        destination:
          '/webdav/tenant-a/%E7%9F%A5%E8%AF%86%E5%BA%93%E4%B8%80/%E5%BD%92%E6%A1%A3/%E8%AF%B4%E6%98%8E.md',
        'user-agent': 'Obsidian/1.8.10',
        'content-type': 'application/octet-stream',
        'content-length': '123',
      },
      ip: '::1',
      ...overrides,
    } as Request;
  }

  function createResponse(statusCode: number) {
    const response = { statusCode } as ResponseStub;
    response.on = jest.fn((event: string, handler: () => void) => {
      if (event === 'finish') {
        finishHandler = handler;
      }
      return response as unknown as Response;
    }) as unknown as ResponseStub['on'];
    response.getHeader = jest.fn(() => undefined) as ResponseStub['getHeader'];
    response.setHeader = jest.fn() as ResponseStub['setHeader'];
    response.getHeaders = jest.fn(() => ({
      'content-type': 'text/plain; charset=utf-8',
      allow: 'OPTIONS, PROPFIND, GET, HEAD, MKCOL, PUT, DELETE, MOVE',
    })) as ResponseStub['getHeaders'];

    return response as unknown as Response;
  }

  beforeEach(() => {
    if (originalVerboseFlag === undefined) {
      delete process.env.WEBDAV_ACCESS_LOG_VERBOSE;
    } else {
      process.env.WEBDAV_ACCESS_LOG_VERBOSE = originalVerboseFlag;
    }

    finishHandler = undefined;
    middleware = new RequestTraceMiddleware();
    logger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };
    (middleware as unknown as { logger: typeof logger }).logger = logger;
  });

  afterAll(() => {
    if (originalVerboseFlag === undefined) {
      delete process.env.WEBDAV_ACCESS_LOG_VERBOSE;
      return;
    }

    process.env.WEBDAV_ACCESS_LOG_VERBOSE = originalVerboseFlag;
  });

  it('应为失败的 WebDAV 请求记录脱敏后的明细日志', () => {
    const request = createRequest();
    const response = createResponse(409);
    const next = jest.fn() as NextFunction;

    middleware.use(request, response, next);
    finishHandler?.();

    expect(next).toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledTimes(2);

    const detailLog = logger.warn.mock.calls.find(([message]) =>
      message.includes('http.request.webdav '),
    )?.[0];
    expect(detailLog).toContain('"tenantIdFromPath":"tenant-a"');
    expect(detailLog).toContain('"decodedResourcePath":"知识库一/说明.md"');
    expect(detailLog).toContain('"authorization":"[REDACTED]"');
    expect(detailLog).toContain('"destination":"/webdav/tenant-a/');
    expect(detailLog).toContain('"responseHeaders"');
  });

  it('默认不为成功的 WebDAV 请求记录明细日志', () => {
    const request = createRequest({ method: 'PUT' });
    const response = createResponse(204);

    middleware.use(request, response, jest.fn() as NextFunction);
    finishHandler?.();

    expect(logger.log).toHaveBeenCalledTimes(1);
    expect(
      logger.log.mock.calls.some(([message]) =>
        message.includes('http.request.webdav '),
      ),
    ).toBe(false);
  });

  it('开启详细日志开关后应记录成功的 WebDAV 请求明细', () => {
    process.env.WEBDAV_ACCESS_LOG_VERBOSE = 'true';
    const request = createRequest({ method: 'PUT' });
    const response = createResponse(201);

    middleware.use(request, response, jest.fn() as NextFunction);
    finishHandler?.();

    expect(logger.log).toHaveBeenCalledTimes(2);
    expect(
      logger.log.mock.calls.some(([message]) =>
        message.includes('http.request.webdav '),
      ),
    ).toBe(true);
  });
});