import { Controller, Get, Header, UseGuards } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CapabilityObservabilityService } from './application/capability-observability.service';
import { CapabilityPrometheusExporterService } from './infrastructure/capability-prometheus-exporter.service';

@Controller('observability')
export class CapabilityObservabilityController {
  constructor(
    private readonly capabilityObservabilityService: CapabilityObservabilityService,
    private readonly capabilityPrometheusExporterService: CapabilityPrometheusExporterService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Get('capabilities')
  snapshot() {
    return {
      data: this.capabilityObservabilityService.snapshot(),
      meta: {
        channel: 'http',
        scope: 'capability-platform',
      },
      traceId: randomUUID(),
      error: null,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Get('capabilities/prometheus')
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  prometheus() {
    return this.capabilityPrometheusExporterService.render();
  }
}
