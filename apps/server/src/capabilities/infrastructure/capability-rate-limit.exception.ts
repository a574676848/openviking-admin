import { HttpException, HttpStatus } from '@nestjs/common';

export class CapabilityRateLimitException extends HttpException {
  constructor(details: {
    scope: string;
    key: string;
    limit: number;
    remaining: number;
    resetAt: string;
  }) {
    super(
      {
        code: 'CAPABILITY_RATE_LIMITED',
        message: `触发限流: ${String(details.scope ?? 'unknown')}`,
        details,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
