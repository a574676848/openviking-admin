import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import type { AuthenticatedRequest } from './authenticated-request.interface';
import { ensureRequestTrace, resolveRequestIp } from './request-trace';

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
}

