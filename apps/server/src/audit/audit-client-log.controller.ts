import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { AuditService } from './audit.service';

interface ClientLogBody {
  level?: string;
  message?: string;
  digest?: string;
  path?: string;
  ts?: number;
}

const SAFE_LEVELS = new Set(['error', 'warn', 'info']);
const REDACTION_PATTERNS = [
  /(bearer\s+)[a-z0-9\-._~+/]+=*/gi,
  /\bov-[a-z]+-[a-z0-9_-]+\b/gi,
  /\beyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+\b/g,
];

function sanitizeText(value: unknown, fallback: string) {
  const text = typeof value === 'string' ? value.trim() : '';
  const trimmed = text.length > 0 ? text : fallback;
  const redacted = REDACTION_PATTERNS.reduce(
    (result, pattern) => result.replace(pattern, '$1[REDACTED]'),
    trimmed,
  );

  return redacted.slice(0, 280);
}

@Controller('audit')
export class AuditClientLogController {
  constructor(private readonly auditService: AuditService) {}

  @Post('client-log')
  @HttpCode(202)
  async ingest(@Body() body: ClientLogBody, @Req() req: Request) {
    const level = SAFE_LEVELS.has(String(body.level)) ? String(body.level) : 'error';

    await this.auditService.log({
      action: 'client.error',
      target: sanitizeText(body.path, req.originalUrl || req.url || '/'),
      success: level !== 'error',
      ip: req.ip,
      meta: {
        source: 'web',
        level,
        message: sanitizeText(body.message, '浏览器侧异常'),
        digest: sanitizeText(body.digest, 'n/a'),
        path: sanitizeText(body.path, req.originalUrl || req.url || '/'),
        requestId: req.headers['x-request-id'],
        traceId: req.headers['x-trace-id'],
        userAgent: sanitizeText(req.headers['user-agent'], 'unknown'),
        clientTimestamp:
          typeof body.ts === 'number' && Number.isFinite(body.ts)
            ? new Date(body.ts).toISOString()
            : null,
      },
    });

    return {
      accepted: true,
    };
  }
}

