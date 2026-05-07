import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import type { AuthenticatedRequest } from './authenticated-request.interface';
import { ensureRequestTrace, resolveRequestIp } from './request-trace';

const WEBDAV_PATH_PREFIX = '/webdav/';
const WEBDAV_VERBOSE_ACCESS_LOG_ENV = 'WEBDAV_ACCESS_LOG_VERBOSE';
const SENSITIVE_LOG_HEADERS = new Set([
  'authorization',
  'proxy-authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
]);

function normalizeLoggedHeaderValue(
  value: unknown,
): string | string[] | null {
  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeLoggedHeaderValue(item))
      .filter((item): item is string => typeof item === 'string');
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return null;
}

function sanitizeHeaders(headers: Record<string, unknown>) {
  const sanitized: Record<string, string | string[]> = {};

  for (const [rawKey, rawValue] of Object.entries(headers)) {
    const key = rawKey.toLowerCase();
    if (SENSITIVE_LOG_HEADERS.has(key)) {
      sanitized[key] = '[REDACTED]';
      continue;
    }

    const normalizedValue = normalizeLoggedHeaderValue(rawValue);
    if (
      normalizedValue === null ||
      (Array.isArray(normalizedValue) && normalizedValue.length === 0)
    ) {
      continue;
    }

    sanitized[key] = normalizedValue;
  }

  return sanitized;
}

function stripQueryString(path: string) {
  const queryIndex = path.indexOf('?');
  return queryIndex >= 0 ? path.slice(0, queryIndex) : path;
}

function decodePathSegment(segment: string) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

@Injectable()
export class RequestTraceMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HttpAccess');

  use(request: Request, response: Response, next: NextFunction) {
    const startedAt = Date.now();
    const trace = ensureRequestTrace(request, response);

    response.on('finish', () => {
      const authenticatedRequest = request as AuthenticatedRequest;
      const path = request.originalUrl || request.url;
      const payload = {
        requestId: trace.requestId,
        traceId: trace.traceId,
        method: request.method,
        path,
        statusCode: response.statusCode,
        durationMs: Date.now() - startedAt,
        tenantId: authenticatedRequest.tenantScope ?? authenticatedRequest.user?.tenantId ?? null,
        userId: authenticatedRequest.user?.id ?? null,
        username: authenticatedRequest.user?.username ?? null,
        ip: resolveRequestIp(request),
      };

      this.logWebdavDetail(request, response, payload);

      if (response.statusCode >= 500) {
        this.logger.error(`http.request ${JSON.stringify(payload)}`);
        return;
      }

      if (response.statusCode >= 400) {
        this.logger.warn(`http.request ${JSON.stringify(payload)}`);
        return;
      }

      this.logger.log(`http.request ${JSON.stringify(payload)}`);
    });

    next();
  }

  private logWebdavDetail(
    request: Request,
    response: Response,
    payload: Record<string, unknown>,
  ) {
    const path = request.originalUrl || request.url;
    if (!this.shouldLogWebdavDetail(path, response.statusCode)) {
      return;
    }

    const { tenantIdFromPath, resourcePath, decodedResourcePath } =
      this.resolveWebdavPath(path);
    const detailPayload = {
      ...payload,
      tenantIdFromPath,
      resourcePath,
      decodedResourcePath,
      requestHeaders: sanitizeHeaders(request.headers as Record<string, unknown>),
      responseHeaders: sanitizeHeaders(response.getHeaders()),
    };

    if (response.statusCode >= 500) {
      this.logger.error(`http.request.webdav ${JSON.stringify(detailPayload)}`);
      return;
    }

    if (response.statusCode >= 400) {
      this.logger.warn(`http.request.webdav ${JSON.stringify(detailPayload)}`);
      return;
    }

    this.logger.log(`http.request.webdav ${JSON.stringify(detailPayload)}`);
  }

  private shouldLogWebdavDetail(path: string, statusCode: number) {
    if (!stripQueryString(path).startsWith(WEBDAV_PATH_PREFIX)) {
      return false;
    }

    return (
      statusCode >= 400 ||
      process.env[WEBDAV_VERBOSE_ACCESS_LOG_ENV] === 'true'
    );
  }

  private resolveWebdavPath(path: string) {
    const segments = stripQueryString(path).split('/').filter(Boolean);
    const tenantIdFromPath = segments[1] ?? null;
    const resourceSegments = segments.slice(2);

    return {
      tenantIdFromPath,
      resourcePath: resourceSegments.join('/'),
      decodedResourcePath: resourceSegments.map(decodePathSegment).join('/'),
    };
  }
}

