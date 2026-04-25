import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';
import type { QueryRunner } from 'typeorm';

interface RequestWithQueryRunner {
  tenantQueryRunner?: QueryRunner;
}

@Injectable()
export class TenantCleanupInterceptor implements NestInterceptor {
  private readonly logger = new Logger(TenantCleanupInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<RequestWithQueryRunner>();

    return next.handle().pipe(
      finalize(() => {
        const qr = request.tenantQueryRunner;
        if (qr && !qr.isReleased) {
          qr.release().catch((err: unknown) => {
            const message = err instanceof Error ? err.message : '未知错误';
            this.logger.error(
              `Failed to release tenant QueryRunner: ${message}`,
            );
          });
        }
      }),
    );
  }
}
