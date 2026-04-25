import { CapabilityExecutionService } from './capability-execution.service';
import { CapabilityCatalogService } from './capability-catalog.service';
import { CapabilityAuthorizationService } from './capability-authorization.service';
import { CapabilityObservabilityService } from './capability-observability.service';
import { KnowledgeCapabilityGateway } from '../infrastructure/knowledge-capability.gateway';
import { CapabilityRateLimitService } from '../infrastructure/capability-rate-limit.service';
import type { CapabilityContext } from '../domain/capability.types';
import { CapabilityRateLimitException } from '../infrastructure/capability-rate-limit.exception';

describe('CapabilityExecutionService', () => {
  const catalog = new CapabilityCatalogService();
  const authorization = {
    authorize: jest.fn(),
  } as unknown as CapabilityAuthorizationService;
  const observability = {
    recordSuccess: jest.fn(),
    recordFailure: jest.fn(),
    recordRejected: jest.fn(),
  } as unknown as CapabilityObservabilityService;
  const gateway = {
    search: jest.fn(),
    grep: jest.fn(),
    listResources: jest.fn(),
    treeResources: jest.fn(),
  } as unknown as KnowledgeCapabilityGateway;
  const rateLimit = {
    assertAllowed: jest.fn(),
  } as unknown as CapabilityRateLimitService;

  const service = new CapabilityExecutionService(
    catalog,
    authorization,
    observability,
    rateLimit,
    gateway,
  );

  const context: CapabilityContext = {
    principal: {
      userId: 'user-1',
      username: 'alice',
      tenantId: 'tenant-1',
      scope: 'tenant',
      credentialType: 'jwt_access_token',
      clientType: 'service',
      ovConfig: {
        baseUrl: 'http://ov.local',
        apiKey: 'secret',
        account: 'default',
      },
    },
    trace: {
      traceId: 'trace-1',
      spanId: 'span-1',
      requestId: 'request-1',
      tenantId: 'tenant-1',
      userId: 'user-1',
      channel: 'http',
      clientType: 'service',
      credentialType: 'jwt_access_token',
      capability: 'knowledge.search',
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should execute knowledge.search through shared gateway', async () => {
    rateLimit.assertAllowed = jest.fn();
    gateway.search = jest.fn().mockResolvedValue({
      items: [{ uri: 'viking://resources/tenants/tenant-1/doc-1', score: 0.9 }],
    });

    const result = await service.execute(
      'knowledge.search',
      { query: '多租户隔离' },
      context,
    );

    expect(result.traceId).toBe('trace-1');
    expect(result.data).toEqual({
      items: [{ uri: 'viking://resources/tenants/tenant-1/doc-1', score: 0.9 }],
    });
    expect((authorization.authorize as jest.Mock).mock.calls.length).toBe(1);
    expect((observability.recordSuccess as jest.Mock).mock.calls.length).toBe(1);
  });

  it('should record failure when gateway throws', async () => {
    rateLimit.assertAllowed = jest.fn();
    gateway.grep = jest.fn().mockRejectedValue(new Error('OV timeout'));

    await expect(
      service.execute('knowledge.grep', { pattern: 'tenant' }, {
        ...context,
        trace: {
          ...context.trace,
          capability: 'knowledge.grep',
        },
      }),
    ).rejects.toThrow('OV timeout');

    expect((observability.recordFailure as jest.Mock).mock.calls.length).toBe(1);
  });

  it('should record rejection when rate limit is hit', async () => {
    rateLimit.assertAllowed = jest.fn(() => {
      throw new CapabilityRateLimitException({
        scope: 'user',
        key: 'user:user-1',
        limit: 1,
        remaining: 0,
        resetAt: new Date().toISOString(),
      });
    });

    await expect(
      service.execute('knowledge.search', { query: '限流' }, context),
    ).rejects.toThrow(CapabilityRateLimitException);

    expect((observability.recordRejected as jest.Mock).mock.calls.length).toBe(1);
    expect((observability.recordFailure as jest.Mock).mock.calls.length).toBe(0);
  });
});
