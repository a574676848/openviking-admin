import { HttpException, HttpStatus } from '@nestjs/common';

export class CapabilityTimeoutException extends HttpException {
  constructor(
    readonly capabilityId: string,
    readonly timeoutMs: number,
  ) {
    super(
      {
        code: 'CAPABILITY_TIMEOUT',
        message: `capability "${capabilityId}" 执行超时 (${timeoutMs}ms)`,
        details: { capabilityId, timeoutMs },
      },
      HttpStatus.GATEWAY_TIMEOUT,
    );
  }
}