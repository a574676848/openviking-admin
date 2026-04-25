import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { HttpAdapterHost } from '@nestjs/core';

interface ErrorLike {
  message?: string;
  stack?: string;
  response?: unknown;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.httpAdapterHost;
    const ctx = host.switchToHttp();

    const httpStatus =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const err = exception as ErrorLike;
    const request = ctx.getRequest();
    const response = ctx.getResponse();
    const requestUrl = httpAdapter.getRequestUrl(request) as string;
    const requestId = String(
      request.headers?.['x-request-id'] ??
        request.headers?.['x-trace-id'] ??
        randomUUID(),
    );
    const traceId = randomUUID();
    const message = this.resolveMessage(exception, err);
    const code = this.mapErrorCode(httpStatus, err);
    const responseBody = {
      data: null,
      meta: {
        requestId,
        timestamp: new Date().toISOString(),
        path: requestUrl,
      },
      traceId,
      error: {
        code,
        message,
        statusCode: httpStatus,
      },
      statusCode: httpStatus,
      timestamp: new Date().toISOString(),
      path: requestUrl,
      message,
    };

    if (httpStatus === 500) {
      this.logger.error(
        `Unhandled Exception traceId=${traceId} requestId=${requestId}: ${JSON.stringify(exception)}`,
        err?.stack,
      );
    }

    httpAdapter.setHeader(response, 'x-trace-id', traceId);
    httpAdapter.setHeader(response, 'x-request-id', requestId);
    httpAdapter.reply(response, responseBody, httpStatus);
  }

  private resolveMessage(exception: unknown, err: ErrorLike) {
    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      if (typeof response === 'string') {
        return response;
      }
      if (
        response &&
        typeof response === 'object' &&
        'message' in response &&
        typeof response.message === 'string'
      ) {
        return response.message;
      }
    }

    return err?.message || 'Internal Server Error';
  }

  private mapErrorCode(httpStatus: number, err: ErrorLike) {
    const response = err.response;
    if (
      response &&
      typeof response === 'object' &&
      'code' in response &&
      typeof response.code === 'string'
    ) {
      return response.code;
    }

    switch (httpStatus) {
      case HttpStatus.UNAUTHORIZED:
        return 'CAPABILITY_UNAUTHORIZED';
      case HttpStatus.FORBIDDEN:
        return 'CAPABILITY_FORBIDDEN';
      case HttpStatus.NOT_FOUND:
        return 'CAPABILITY_NOT_FOUND';
      case HttpStatus.BAD_REQUEST:
        return 'CAPABILITY_INVALID_INPUT';
      case HttpStatus.TOO_MANY_REQUESTS:
        return 'CAPABILITY_RATE_LIMITED';
      default:
        return 'CAPABILITY_EXECUTION_FAILED';
    }
  }
}
