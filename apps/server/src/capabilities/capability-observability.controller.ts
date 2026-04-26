import { Controller, Get, Header, Query, Req, Res, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CapabilityObservabilityService } from './application/capability-observability.service';
import { CapabilityPrometheusExporterService } from './infrastructure/capability-prometheus-exporter.service';
import type { Response } from 'express';
import { ensureRequestTrace } from '../common/request-trace';
import type { AuthenticatedRequest } from '../common/authenticated-request.interface';

@Controller('observability')
export class CapabilityObservabilityController {
  constructor(
    private readonly capabilityObservabilityService: CapabilityObservabilityService,
    private readonly capabilityPrometheusExporterService: CapabilityPrometheusExporterService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Get('capabilities')
  async snapshot(
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const trace = ensureRequestTrace(req, res);
    return {
      data: await this.capabilityObservabilityService.snapshot(),
      meta: {
        channel: 'http',
        scope: 'capability-platform',
        requestId: trace.requestId,
      },
      traceId: trace.traceId,
      error: null,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Get('capabilities/correlation')
  async correlation(
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
    @Query('limit') limit?: string,
  ) {
    const trace = ensureRequestTrace(req, res);
    const parsedLimit = Number.parseInt(limit ?? '20', 10);
    const tenantId =
      req.user?.role === 'super_admin' ? null : req.user?.tenantId ?? null;
    return {
      data: await this.capabilityObservabilityService.auditCorrelation(
        tenantId,
        Number.isFinite(parsedLimit) ? parsedLimit : 20,
      ),
      meta: {
        channel: 'http',
        scope: 'capability-platform',
        requestId: trace.requestId,
      },
      traceId: trace.traceId,
      error: null,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Get('capabilities/prometheus')
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  async prometheus() {
    return await this.capabilityPrometheusExporterService.render();
  }
}
