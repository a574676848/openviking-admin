import { CapabilityObservabilityService } from './capability-observability.service';
import { AuditService } from '../../audit/audit.service';
import { CapabilityMetricsService } from '../infrastructure/capability-metrics.service';
import { CapabilityRateLimitService } from '../infrastructure/capability-rate-limit.service';
import { InMemoryCapabilityRateLimitStore } from '../infrastructure/in-memory-capability-rate-limit.store';

describe('CapabilityObservabilityService', () => {
  const auditService = {
    log: jest.fn(),
  } as unknown as AuditService;
  const metricsService = new CapabilityMetricsService();
  const rateLimitService = new CapabilityRateLimitService(
    new InMemoryCapabilityRateLimitStore(),
  );

  const service = new CapabilityObservabilityService(
    auditService,
    metricsService,
    rateLimitService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should write success audit entries with trace metadata', async () => {
    await service.recordSuccess(
      {
        traceId: 'trace-1',
        spanId: 'span-1',
        requestId: 'request-1',
        tenantId: 'tenant-1',
        userId: 'user-1',
        channel: 'http',
        clientType: 'service',
        credentialType: 'capability_access_token',
        capability: 'knowledge.search',
      },
      {
        userId: 'user-1',
        username: 'alice',
        tenantId: 'tenant-1',
        role: 'tenant_admin',
        scope: 'tenant',
        credentialType: 'capability_access_token',
        clientType: 'service',
        ovConfig: {
          baseUrl: 'http://ov.local',
          apiKey: 'secret',
          account: 'default',
        },
      },
      {
        capability: 'knowledge.search',
        channel: 'http',
        version: 'v1',
        durationMs: 42,
      },
    );

    expect((auditService.log as jest.Mock).mock.calls[0][0]).toEqual(
      expect.objectContaining({
        action: 'capability.invoke',
        success: true,
        target: 'knowledge.search',
        meta: expect.objectContaining({
          traceId: 'trace-1',
          durationMs: 42,
        }),
      }),
    );
  });

  it('should expose metrics and rate limit snapshot', async () => {
    await service.recordCredentialExchange({
      traceId: 'trace-credential-1',
      requestId: 'request-credential-1',
      principal: {
        userId: 'user-1',
        username: 'alice',
        tenantId: 'tenant-1',
        role: 'tenant_admin',
        scope: 'tenant',
        credentialType: 'jwt_access_token',
        clientType: 'service',
        ovConfig: {
          baseUrl: 'http://ov.local',
          apiKey: 'secret',
          account: 'default',
        },
      },
      flow: 'token.exchange',
      issuedCredentialType: 'capability_access_token',
      success: true,
    });

    const snapshot = service.snapshot();

    expect(snapshot.metrics.counters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: expect.stringContaining('capability=credential.exchange'),
        }),
      ]),
    );
    expect(snapshot.rateLimit.rules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ scope: 'tenant' }),
        expect.objectContaining({ scope: 'user' }),
      ]),
    );
    expect(snapshot.alerts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'CAPABILITY_FAILURE_RATE' }),
        expect.objectContaining({ code: 'TENANT_TRAFFIC_SPIKE' }),
      ]),
    );
  });
});
