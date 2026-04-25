import { randomBytes, randomUUID } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { AuditService } from '../../audit/audit.service';
import { CapabilityMetricsService } from '../infrastructure/capability-metrics.service';
import { CapabilityRateLimitService } from '../infrastructure/capability-rate-limit.service';
import {
  CapabilityId,
  CapabilityInvocationMeta,
  ClientType,
  CredentialType,
  Principal,
  TraceContext,
} from '../domain/capability.types';

@Injectable()
export class CapabilityObservabilityService {
  private readonly logger = new Logger(CapabilityObservabilityService.name);

  constructor(
    private readonly auditService: AuditService,
    private readonly capabilityMetricsService: CapabilityMetricsService,
    private readonly capabilityRateLimitService: CapabilityRateLimitService,
  ) {}

  createTraceContext(params: {
    capability: CapabilityId;
    principal: Principal;
    channel: 'http' | 'mcp' | 'cli' | 'skill';
    requestId?: string;
  }): TraceContext {
    return {
      traceId: randomUUID(),
      spanId: randomBytes(8).toString('hex'),
      requestId: params.requestId ?? randomUUID(),
      tenantId: params.principal.tenantId,
      userId: params.principal.userId,
      channel: params.channel,
      clientType: params.principal.clientType,
      credentialType: params.principal.credentialType,
      capability: params.capability,
    };
  }

  async recordSuccess(
    trace: TraceContext,
    principal: Principal,
    meta: CapabilityInvocationMeta,
  ) {
    const payload = {
      traceId: trace.traceId,
      spanId: trace.spanId,
      requestId: trace.requestId,
      tenantId: trace.tenantId,
      userId: trace.userId,
      channel: trace.channel,
      clientType: trace.clientType,
      credentialType: trace.credentialType,
      capability: trace.capability,
      durationMs: meta.durationMs,
    };

    this.logger.log(`capability.success ${JSON.stringify(payload)}`);
    this.capabilityMetricsService.incrementCounter({
      capability: trace.capability,
      channel: trace.channel,
      clientType: trace.clientType,
      credentialType: trace.credentialType,
      outcome: 'success',
    });
    this.capabilityMetricsService.recordLatency({
      capability: trace.capability,
      channel: trace.channel,
      durationMs: meta.durationMs,
    });
    await this.auditService.log({
      tenantId: principal.tenantId ?? undefined,
      userId: principal.userId,
      username: principal.username,
      action: 'capability.invoke',
      target: trace.capability,
      success: true,
      meta: payload,
    });
  }

  async recordFailure(
    trace: TraceContext,
    principal: Principal | null,
    error: unknown,
    clientType?: ClientType,
    credentialType?: CredentialType,
  ) {
    const message = error instanceof Error ? error.message : '未知错误';
    const payload = {
      traceId: trace.traceId,
      spanId: trace.spanId,
      requestId: trace.requestId,
      tenantId: trace.tenantId,
      userId: trace.userId,
      channel: trace.channel,
      clientType: clientType ?? trace.clientType,
      credentialType: credentialType ?? trace.credentialType,
      capability: trace.capability,
      error: message,
    };

    this.logger.error(`capability.failure ${JSON.stringify(payload)}`);
    this.capabilityMetricsService.incrementCounter({
      capability: trace.capability,
      channel: trace.channel,
      clientType: clientType ?? trace.clientType,
      credentialType: credentialType ?? trace.credentialType,
      outcome: 'failure',
    });
    await this.auditService.log({
      tenantId: principal?.tenantId ?? undefined,
      userId: principal?.userId,
      username: principal?.username,
      action: 'capability.invoke',
      target: trace.capability,
      success: false,
      meta: payload,
    });
  }

  async recordRejected(
    trace: TraceContext,
    principal: Principal,
    reason: string,
  ) {
    const payload = {
      traceId: trace.traceId,
      spanId: trace.spanId,
      requestId: trace.requestId,
      tenantId: trace.tenantId,
      userId: trace.userId,
      channel: trace.channel,
      clientType: trace.clientType,
      credentialType: trace.credentialType,
      capability: trace.capability,
      reason,
    };

    this.logger.warn(`capability.rejected ${JSON.stringify(payload)}`);
    this.capabilityMetricsService.incrementCounter({
      capability: trace.capability,
      channel: trace.channel,
      clientType: trace.clientType,
      credentialType: trace.credentialType,
      outcome: 'rejected',
    });
    await this.auditService.log({
      tenantId: principal.tenantId ?? undefined,
      userId: principal.userId,
      username: principal.username,
      action: 'capability.invoke',
      target: trace.capability,
      success: false,
      meta: {
        ...payload,
        status: 'rejected',
      },
    });
  }

  async recordCredentialExchange(params: {
    traceId: string;
    requestId: string;
    principal: Principal;
    flow: 'token.exchange' | 'session.exchange' | 'client.credentials';
    issuedCredentialType: CredentialType | 'api_key';
    success: boolean;
    error?: string;
  }) {
    const payload = {
      traceId: params.traceId,
      requestId: params.requestId,
      tenantId: params.principal.tenantId,
      userId: params.principal.userId,
      clientType: params.principal.clientType,
      credentialType: params.principal.credentialType,
      flow: params.flow,
      issuedCredentialType: params.issuedCredentialType,
      success: params.success,
      error: params.error,
    };

    if (params.success) {
      this.logger.log(`credential.exchange.success ${JSON.stringify(payload)}`);
    } else {
      this.logger.error(`credential.exchange.failure ${JSON.stringify(payload)}`);
    }

    this.capabilityMetricsService.incrementCounter({
      capability: 'credential.exchange',
      channel: 'auth',
      clientType: params.principal.clientType,
      credentialType: params.issuedCredentialType,
      flow: params.flow,
      outcome: params.success ? 'success' : 'failure',
    });
    await this.auditService.log({
      tenantId: params.principal.tenantId ?? undefined,
      userId: params.principal.userId,
      username: params.principal.username,
      action: 'capability.credential.issue',
      target: params.flow,
      success: params.success,
      meta: payload,
    });
  }

  snapshot() {
    const metrics = this.capabilityMetricsService.snapshot();
    const rateLimit = this.capabilityRateLimitService.snapshot();

    return {
      metrics,
      rateLimit,
      alerts: this.buildAlerts(metrics, rateLimit),
    };
  }

  private buildAlerts(
    metrics: ReturnType<CapabilityMetricsService['snapshot']>,
    rateLimit: ReturnType<CapabilityRateLimitService['snapshot']>,
  ) {
    const failureCounter = metrics.counters
      .filter((item) => item.key.includes('outcome=failure'))
      .reduce((sum, item) => sum + item.value, 0);
    const rejectedCounter = metrics.counters
      .filter((item) => item.key.includes('outcome=rejected'))
      .reduce((sum, item) => sum + item.value, 0);
    const downstreamLatencyHotspots = metrics.latency.filter(
      (item) => item.p95Ms >= 1500 || item.p99Ms >= 3000,
    );
    const tenantTrafficHotspots = rateLimit.activeBuckets.filter(
      (item) => item.key.startsWith('tenant:') && item.count >= 100,
    );

    return [
      {
        code: 'CAPABILITY_FAILURE_RATE',
        severity: failureCounter > 0 ? 'warning' : 'ok',
        triggered: failureCounter > 0,
        value: failureCounter,
      },
      {
        code: 'RATE_LIMIT_REJECTIONS',
        severity: rejectedCounter > 0 ? 'warning' : 'ok',
        triggered: rejectedCounter > 0,
        value: rejectedCounter,
      },
      {
        code: 'OV_TIMEOUT_RISK',
        severity: downstreamLatencyHotspots.length > 0 ? 'warning' : 'ok',
        triggered: downstreamLatencyHotspots.length > 0,
        value: downstreamLatencyHotspots.length,
      },
      {
        code: 'TENANT_TRAFFIC_SPIKE',
        severity: tenantTrafficHotspots.length > 0 ? 'warning' : 'ok',
        triggered: tenantTrafficHotspots.length > 0,
        value: tenantTrafficHotspots.length,
      },
    ];
  }
}
