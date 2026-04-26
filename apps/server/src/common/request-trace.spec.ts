import type { Request, Response } from 'express';
import { ensureRequestTrace } from './request-trace';

describe('ensureRequestTrace', () => {
  it('should reuse incoming request headers', () => {
    const request = {
      headers: {
        'x-request-id': 'request-1',
        'x-trace-id': 'trace-1',
      },
    } as Partial<Request> as Request;
    const response = {
      getHeader: jest.fn(),
      setHeader: jest.fn(),
    } as Partial<Response> as Response;

    const trace = ensureRequestTrace(request, response);

    expect(trace).toEqual({
      requestId: 'request-1',
      traceId: 'trace-1',
    });
    expect(response.getHeader).toHaveBeenCalled();
  });

  it('should generate missing ids once and persist them on request', () => {
    const request = {
      headers: {},
    } as Partial<Request> as Request;
    const response = {
      getHeader: jest.fn(),
      setHeader: jest.fn(),
    } as Partial<Response> as Response;

    const first = ensureRequestTrace(request, response);
    const second = ensureRequestTrace(request, response);

    expect(first.requestId).toBe(second.requestId);
    expect(first.traceId).toBe(second.traceId);
  });
});
