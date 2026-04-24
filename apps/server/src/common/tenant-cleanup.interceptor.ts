import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { QueryRunner } from 'typeorm';

@Injectable()
export class TenantCleanupInterceptor implements NestInterceptor {
  private readonly logger = new Logger(TenantCleanupInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();

    return next.handle().pipe(
      finalize(async () => {
        const qr: QueryRunner = request.tenantQueryRunner;
        if (qr && !qr.isReleased) {
          try {
            await qr.release();
          } catch (err) {
            this.logger.error(
              `Failed to release tenant QueryRunner: ${err.message}`,
            );
          }
        }
      }),
    );
  }
}
