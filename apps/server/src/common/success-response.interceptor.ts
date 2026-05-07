import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  StreamableFile,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, map } from 'rxjs';
import { ensureRequestTrace } from './request-trace';

interface ResponseEnvelope<T> {
  data: T;
  meta: Record<string, unknown>;
  traceId: string;
  error: null;
}

@Injectable()
export class SuccessResponseInterceptor<T>
  implements NestInterceptor<T, T | ResponseEnvelope<T>>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<T | ResponseEnvelope<T>> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const { requestId, traceId } = ensureRequestTrace(request, response);

    return next.handle().pipe(
      map((data) => {
        if (this.shouldBypass(request, response, data)) {
          return data;
        }

        if (this.isEnvelope(data)) {
          return data;
        }

        return {
          data,
          meta: {
            requestId,
            timestamp: new Date().toISOString(),
            path: request.originalUrl || request.url,
            version: 'v1',
          },
          traceId,
          error: null,
        };
      }),
    );
  }

  private shouldBypass(request: Request, response: Response, data: unknown) {
    const path = request.originalUrl || request.url;
    const contentType = String(response.getHeader('content-type') ?? '');

    return (
      path.includes('/webdav/') ||
      path.includes('/mcp/sse') ||
      contentType.includes('text/event-stream') ||
      contentType.includes('xml') ||
      data instanceof StreamableFile ||
      Buffer.isBuffer(data)
    );
  }

  private isEnvelope(data: unknown): data is ResponseEnvelope<unknown> {
    if (!data || typeof data !== 'object') {
      return false;
    }

    return (
      'data' in data &&
      'meta' in data &&
      'traceId' in data &&
      'error' in data
    );
  }
}
