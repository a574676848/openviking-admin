import { randomUUID } from 'crypto';
import type { Request, Response } from 'express';

export const REQUEST_ID_HEADER = 'x-request-id';
export const TRACE_ID_HEADER = 'x-trace-id';

type RequestWithTrace = Request & {
  requestId?: string;
  traceId?: string;
};

function normalizeHeaderValue(value: unknown) {
  if (Array.isArray(value)) {
    return typeof value[0] === 'string' ? value[0] : undefined;
  }

  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function ensureRequestTrace(request: Request, response?: Response) {
  const traceRequest = request as RequestWithTrace;
  const responseRequestId = response
    ? normalizeHeaderValue(response.getHeader(REQUEST_ID_HEADER))
    : undefined;
  const responseTraceId = response
    ? normalizeHeaderValue(response.getHeader(TRACE_ID_HEADER))
    : undefined;
  const requestId =
    responseRequestId ??
    traceRequest.requestId ??
    normalizeHeaderValue(request.headers[REQUEST_ID_HEADER]) ??
    normalizeHeaderValue(request.headers[TRACE_ID_HEADER]) ??
    randomUUID();
  const traceId =
    responseTraceId ??
    traceRequest.traceId ??
    normalizeHeaderValue(request.headers[TRACE_ID_HEADER]) ??
    randomUUID();

  traceRequest.requestId = requestId;
  traceRequest.traceId = traceId;
  request.headers[REQUEST_ID_HEADER] = requestId;
  request.headers[TRACE_ID_HEADER] = traceId;

  if (response) {
    response.setHeader(REQUEST_ID_HEADER, requestId);
    response.setHeader(TRACE_ID_HEADER, traceId);
  }

  return { requestId, traceId };
}

export function resolveRequestIp(request: Request) {
  const forwarded = normalizeHeaderValue(request.headers['x-forwarded-for']);
  if (forwarded) {
    return forwarded.split(',')[0]?.trim() ?? request.ip ?? null;
  }

  return request.ip ?? null;
}

