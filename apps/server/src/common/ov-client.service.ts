import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';

export interface OVConnection {
  baseUrl: string;
  apiKey?: string;
  account?: string;
}

export interface OVRequestMeta {
  traceId?: string;
  requestId?: string;
}

export interface OVRequestOptions {
  timeoutMs?: number;
  headers?: Record<string, string>;
  serviceLabel?: string;
  retryCount?: number;
  retryDelayMs?: number;
}

interface OVRequestErrorResponse {
  code: string;
  message: string;
}

const DEFAULT_RETRY_DELAY_MS = 200;
const RETRIABLE_STATUS_CODES = new Set([408, 429, 502, 503, 504]);

export class OpenVikingRequestException extends HttpException {
  constructor(
    readonly serviceLabel: string,
    readonly retriable: boolean,
    readonly statusCode: number,
    readonly traceId?: string,
    readonly requestId?: string,
    response?: OVRequestErrorResponse,
  ) {
    super(
      response ?? {
        code: 'OV_UPSTREAM_FAILED',
        message: `${serviceLabel} 请求失败`,
      },
      statusCode,
    );
  }
}

@Injectable()
export class OVClientService {
  private readonly logger = new Logger(OVClientService.name);

  async request(
    conn: OVConnection,
    path: string,
    method: string = 'GET',
    body?: Record<string, unknown>,
    meta?: OVRequestMeta,
    options?: OVRequestOptions,
  ) {
    const url = `${conn.baseUrl}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-api-key': conn.apiKey || '',
      'X-OpenViking-Account': conn.account || 'default',
      ...(options?.headers ?? {}),
    };
    return this.requestJson(
      url,
      method,
      headers,
      body,
      meta,
      options,
    );
  }

  async requestExternal(
    url: string,
    method: string = 'GET',
    body?: Record<string, unknown>,
    meta?: OVRequestMeta,
    options?: OVRequestOptions,
  ) {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    };

    return this.requestJson(
      url,
      method,
      headers,
      body,
      meta,
      options,
    );
  }

  async getHealth(baseUrl: string) {
    try {
      const res = await fetch(`${baseUrl}/health`);
      return (await res.json()) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  private async requestJson(
    url: string,
    method: string,
    headers: Record<string, string>,
    body: Record<string, unknown> | undefined,
    meta?: OVRequestMeta,
    options?: OVRequestOptions,
  ) {
    const serviceLabel = options?.serviceLabel ?? 'OpenViking';
    const retryCount = Math.max(options?.retryCount ?? 0, 0);
    const retryDelayMs = Math.max(
      options?.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS,
      0,
    );

    for (let attempt = 0; attempt <= retryCount; attempt += 1) {
      const controller = new AbortController();
      const requestHeaders = { ...headers };
      const timeoutMs = options?.timeoutMs;
      const timeoutId =
        timeoutMs && timeoutMs > 0
          ? setTimeout(() => controller.abort(), timeoutMs)
          : undefined;

      if (meta?.traceId) {
        requestHeaders['x-trace-id'] = meta.traceId;
      }
      if (meta?.requestId) {
        requestHeaders['x-request-id'] = meta.requestId;
      }

      try {
        const res = await fetch(url, {
          method,
          headers: requestHeaders,
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });

        if (!res.ok) {
          const errorText = await res.text();
          throw this.createHttpError(
            serviceLabel,
            res.status,
            errorText,
            meta,
          );
        }

        return (await res.json()) as Record<string, unknown>;
      } catch (error: unknown) {
        const mappedError = this.normalizeError(
          serviceLabel,
          error,
          meta,
        );
        const hasNextAttempt = attempt < retryCount;

        if (mappedError.retriable && hasNextAttempt) {
          this.logger.warn(
            `${serviceLabel} 请求失败，准备重试 (${attempt + 1}/${retryCount + 1}) traceId=${meta?.traceId ?? '-'} requestId=${meta?.requestId ?? '-'}: ${mappedError.message}`,
          );
          await this.sleep(retryDelayMs);
          continue;
        }

        this.logger.error(
          `Failed to connect to ${serviceLabel} traceId=${meta?.traceId ?? '-'} requestId=${meta?.requestId ?? '-'}: ${mappedError.message}`,
        );
        throw mappedError;
      } finally {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      }
    }

    throw this.createHttpError(
      serviceLabel,
      HttpStatus.SERVICE_UNAVAILABLE,
      '重试次数耗尽',
      meta,
    );
  }

  private normalizeError(
    serviceLabel: string,
    error: unknown,
    meta?: OVRequestMeta,
  ) {
    if (error instanceof OpenVikingRequestException) {
      return error;
    }

    if (this.isAbortError(error)) {
      return new OpenVikingRequestException(
        serviceLabel,
        true,
        HttpStatus.GATEWAY_TIMEOUT,
        meta?.traceId,
        meta?.requestId,
        {
          code: 'OV_UPSTREAM_TIMEOUT',
          message: `${serviceLabel} 请求超时`,
        },
      );
    }

    const message = error instanceof Error ? error.message : '未知错误';
    return new OpenVikingRequestException(
      serviceLabel,
      true,
      HttpStatus.SERVICE_UNAVAILABLE,
      meta?.traceId,
      meta?.requestId,
      {
        code: 'OV_UPSTREAM_NETWORK',
        message: `${serviceLabel} 连接失败: ${message}`,
      },
    );
  }

  private createHttpError(
    serviceLabel: string,
    statusCode: number,
    details: string,
    meta?: OVRequestMeta,
  ) {
    const sanitizedDetails = details || '无响应内容';
    const retriable = RETRIABLE_STATUS_CODES.has(statusCode);

    switch (statusCode) {
      case HttpStatus.BAD_REQUEST:
        return new OpenVikingRequestException(
          serviceLabel,
          false,
          HttpStatus.BAD_REQUEST,
          meta?.traceId,
          meta?.requestId,
          {
            code: 'OV_UPSTREAM_BAD_REQUEST',
            message: `${serviceLabel} 请求参数异常: ${sanitizedDetails}`,
          },
        );
      case HttpStatus.UNAUTHORIZED:
        return new OpenVikingRequestException(
          serviceLabel,
          false,
          HttpStatus.UNAUTHORIZED,
          meta?.traceId,
          meta?.requestId,
          {
            code: 'OV_UPSTREAM_UNAUTHORIZED',
            message: `${serviceLabel} 凭证无效`,
          },
        );
      case HttpStatus.FORBIDDEN:
        return new OpenVikingRequestException(
          serviceLabel,
          false,
          HttpStatus.FORBIDDEN,
          meta?.traceId,
          meta?.requestId,
          {
            code: 'OV_UPSTREAM_FORBIDDEN',
            message: `${serviceLabel} 拒绝访问: ${sanitizedDetails}`,
          },
        );
      case HttpStatus.NOT_FOUND:
        return new OpenVikingRequestException(
          serviceLabel,
          false,
          HttpStatus.NOT_FOUND,
          meta?.traceId,
          meta?.requestId,
          {
            code: 'OV_UPSTREAM_NOT_FOUND',
            message: `${serviceLabel} 目标不存在`,
          },
        );
      case HttpStatus.TOO_MANY_REQUESTS:
        return new OpenVikingRequestException(
          serviceLabel,
          true,
          HttpStatus.TOO_MANY_REQUESTS,
          meta?.traceId,
          meta?.requestId,
          {
            code: 'OV_UPSTREAM_RATE_LIMITED',
            message: `${serviceLabel} 触发限流`,
          },
        );
      case HttpStatus.REQUEST_TIMEOUT:
      case HttpStatus.GATEWAY_TIMEOUT:
        return new OpenVikingRequestException(
          serviceLabel,
          true,
          HttpStatus.GATEWAY_TIMEOUT,
          meta?.traceId,
          meta?.requestId,
          {
            code: 'OV_UPSTREAM_TIMEOUT',
            message: `${serviceLabel} 请求超时`,
          },
        );
      case HttpStatus.SERVICE_UNAVAILABLE:
        return new OpenVikingRequestException(
          serviceLabel,
          true,
          HttpStatus.SERVICE_UNAVAILABLE,
          meta?.traceId,
          meta?.requestId,
          {
            code: 'OV_UPSTREAM_UNAVAILABLE',
            message: `${serviceLabel} 暂时不可用`,
          },
        );
      default:
        return new OpenVikingRequestException(
          serviceLabel,
          retriable,
          statusCode >= 500 ? HttpStatus.BAD_GATEWAY : statusCode,
          meta?.traceId,
          meta?.requestId,
          {
            code:
              statusCode >= 500
                ? 'OV_UPSTREAM_BAD_GATEWAY'
                : 'OV_UPSTREAM_FAILED',
            message: `${serviceLabel} 响应异常 [${statusCode}]: ${sanitizedDetails}`,
          },
        );
    }
  }

  private isAbortError(error: unknown) {
    return error instanceof Error && error.name === 'AbortError';
  }

  private sleep(delayMs: number) {
    return new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}
