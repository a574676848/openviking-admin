import { ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { CapabilitiesController } from '../src/capabilities/capabilities.controller';
import { CapabilityAuthController } from '../src/capabilities/capability-auth.controller';
import { CapabilityObservabilityController } from '../src/capabilities/capability-observability.controller';
import { McpController } from '../src/mcp/mcp.controller';
import { McpProtocolService } from '../src/mcp/mcp-protocol.service';
import { McpSseService } from '../src/mcp/mcp-sse.service';
import { CapabilityCatalogService } from '../src/capabilities/application/capability-catalog.service';
import { CapabilityDiscoveryService } from '../src/capabilities/application/capability-discovery.service';
import { CapabilityExecutionService } from '../src/capabilities/application/capability-execution.service';
import { CapabilityObservabilityService } from '../src/capabilities/application/capability-observability.service';
import { CapabilityCredentialService } from '../src/capabilities/infrastructure/capability-credential.service';
import { CredentialExchangeService } from '../src/capabilities/application/credential-exchange.service';
import { CapabilityPrometheusExporterService } from '../src/capabilities/infrastructure/capability-prometheus-exporter.service';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { McpService } from '../src/mcp/mcp.service';
import { McpSessionService } from '../src/mcp/mcp-session.service';
import { AuditService } from '../src/audit/audit.service';
import type { Principal } from '../src/capabilities/domain/capability.types';

describe('Capability Platform (e2e)', () => {
  let app: INestApplication<App>;

  const principal: Principal = {
    userId: 'user-1',
    username: 'alice',
    tenantId: 'tenant-1',
    role: 'tenant_admin',
    scope: 'tenant',
    credentialType: 'jwt_access_token',
    clientType: 'service',
    ovConfig: {
      baseUrl: 'https://ov.example.com',
      apiKey: 'ov-api-key',
      account: 'tenant-account',
    },
  };

  const discoveryService = {
    listCapabilities: jest.fn(() => [
      {
        id: 'knowledge.search',
        description: 'Search knowledge',
        http: { method: 'POST', path: '/api/knowledge/search' },
      },
    ]),
  };
  const catalogService = {
    toMcpTools: jest.fn(() => [
      {
        name: 'knowledge.search',
        description: 'Search knowledge',
        inputSchema: {
          type: 'object',
        },
      },
    ]),
  };
  const executionService = {
    execute: jest.fn(async (capabilityId: string) => ({
      data: {
        items: [
          {
            uri: 'viking://knowledge/doc-1',
            score: 0.92,
          },
        ],
        capabilityId,
      },
      meta: { channel: 'http' },
      traceId: 'trace-http-1',
      error: null,
    })),
  };
  const observabilityService = {
    createTraceContext: jest.fn(() => ({
      traceId: 'trace-http-1',
      spanId: 'span-1',
      requestId: 'request-1',
      tenantId: 'tenant-1',
      userId: 'user-1',
      channel: 'http',
      clientType: 'service',
      credentialType: 'jwt_access_token',
      capability: 'knowledge.search',
    })),
    recordCredentialExchange: jest.fn(),
    snapshot: jest.fn(() => ({
      metrics: {
        counters: [{ key: 'capability=knowledge.search|outcome=success', value: 1 }],
        latency: [],
      },
      rateLimit: {
        rules: [{ scope: 'tenant', limit: 120, windowMs: 60000 }],
        activeBuckets: [],
      },
      alerts: [{ code: 'CAPABILITY_FAILURE_RATE', severity: 'ok', triggered: false, value: 0 }],
    })),
  };
  const credentialService = {
    resolvePrincipalFromJwt: jest.fn(async () => principal),
    resolvePrincipalFromAuthenticatedUser: jest.fn(async () => principal),
    resolvePrincipalFromApiKey: jest.fn(async () => ({
      ...principal,
      credentialType: 'api_key',
    })),
    createApiKey: jest.fn(async () => ({
      apiKey: 'ov-sk-test',
      name: 'cli-client',
      expiresAt: null,
    })),
  };
  const exchangeService = {
    exchangeAccessToken: jest.fn(async () => ({
      credentialType: 'capability_access_token',
      accessToken: 'cap-token',
      expiresInSeconds: 7200,
    })),
    exchangeSessionKey: jest.fn(async () => ({
      credentialType: 'session_key',
      sessionKey: 'session-key',
      expiresInSeconds: 1800,
    })),
  };
  const mcpService = {
    createCapabilityKey: jest.fn(),
    getCapabilityKeysByUser: jest.fn(),
    deleteCapabilityKey: jest.fn(),
  };
  const mcpSessionService = {
    validateSession: jest.fn(),
    enqueueEvent: jest.fn(),
    createSession: jest.fn(),
    pullPendingEvents: jest.fn(),
    touchSession: jest.fn(),
    closeSession: jest.fn(),
  };
  const prometheusExporterService = {
    render: jest.fn(() => '# HELP capability_invocations_total Total capability invocations by outcome.\n'),
  };
  const auditService = {
    log: jest.fn(),
  };
  const mcpSseService = {
    createEventStream: jest.fn(),
  };

  beforeAll(async () => {
    const moduleBuilder = Test.createTestingModule({
      controllers: [
        CapabilitiesController,
        CapabilityAuthController,
        CapabilityObservabilityController,
        McpController,
      ],
      providers: [
        { provide: CapabilityDiscoveryService, useValue: discoveryService },
        { provide: CapabilityCatalogService, useValue: catalogService },
        { provide: CapabilityExecutionService, useValue: executionService },
        { provide: CapabilityObservabilityService, useValue: observabilityService },
        { provide: CapabilityCredentialService, useValue: credentialService },
        { provide: CredentialExchangeService, useValue: exchangeService },
        { provide: CapabilityPrometheusExporterService, useValue: prometheusExporterService },
        { provide: McpService, useValue: mcpService },
        { provide: McpSessionService, useValue: mcpSessionService },
        McpProtocolService,
        { provide: McpSseService, useValue: mcpSseService },
        { provide: AuditService, useValue: auditService },
      ],
    });
    moduleBuilder.overrideGuard(JwtAuthGuard).useValue({
      canActivate(context: ExecutionContext) {
        const req = context.switchToHttp().getRequest();
        req.user = {
          id: 'user-1',
          username: 'alice',
          tenantId: 'tenant-1',
          role: 'tenant_admin',
          scope: 'tenant',
        };
        return true;
      },
    });

    const moduleRef = await moduleBuilder.compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('HTTP 能力接口应返回统一 envelope 与 traceId', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/knowledge/search')
      .set('x-request-id', 'request-http-1')
      .set('Authorization', 'Bearer jwt-token')
      .send({ query: 'tenant' })
      .expect(201);

    expect(response.body.traceId).toBe('trace-http-1');
    expect(response.headers['x-trace-id']).toBe('trace-http-1');
    expect(response.headers['x-request-id']).toBe('request-1');
    expect(response.body.data.items[0].uri).toBe('viking://knowledge/doc-1');
    expect(executionService.execute).toHaveBeenCalledWith(
      'knowledge.search',
      { query: 'tenant' },
      expect.objectContaining({
        principal,
      }),
    );
  });

  it('未携带凭证时 HTTP 能力接口应拒绝访问', async () => {
    await request(app.getHttpServer())
      .post('/api/knowledge/search')
      .send({ query: 'tenant' })
      .expect(401);
  });

  it('凭证发现接口应返回统一换证选项', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/auth/credential-options')
      .set('Authorization', 'Bearer jwt-token')
      .set('x-request-id', 'request-auth-1')
      .expect(200);

    expect(response.headers['x-request-id']).toBe('request-auth-1');
    expect(response.body.data.login.browser.refreshEndpoint).toBe(
      '/api/auth/refresh',
    );
    expect(response.body.data.capabilities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          credentialType: 'capability_access_token',
          issueEndpoint: '/api/auth/token/exchange',
          ttlOptions: expect.any(Array),
        }),
        expect.objectContaining({
          credentialType: 'session_key',
          issueEndpoint: '/api/auth/session/exchange',
          ttlOptions: expect.any(Array),
        }),
      ]),
    );
  });

  it('换证接口应返回 capability access token', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/token/exchange')
      .set('Authorization', 'Bearer jwt-token')
      .set('x-request-id', 'request-token-1')
      .send({ ttlSeconds: 3600 })
      .expect(201);

    expect(response.body.data.accessToken).toBe('cap-token');
    expect(response.body.meta.flow).toBe('token.exchange');
    expect(response.body.meta.requestId).toBe('request-token-1');
    expect(response.headers['x-request-id']).toBe('request-token-1');
    expect(exchangeService.exchangeAccessToken).toHaveBeenCalledWith(
      principal,
      'trace-http-1',
      'request-token-1',
      3600,
    );
  });

  it('观测快照接口应返回 metrics 与 rate limit 数据', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/observability/capabilities')
      .set('Authorization', 'Bearer jwt-token')
      .expect(200);

    expect(response.body.data.metrics.counters[0].key).toContain(
      'capability=knowledge.search',
    );
    expect(response.body.data.rateLimit.rules[0].scope).toBe('tenant');
    expect(response.body.data.alerts[0].code).toBe('CAPABILITY_FAILURE_RATE');
  });

  it('Prometheus 导出接口应返回 exposition 文本', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/observability/capabilities/prometheus')
      .set('Authorization', 'Bearer jwt-token')
      .expect(200);

    expect(response.text).toContain('capability_invocations_total');
  });

  it('MCP tools/list 应映射 capability discovery', async () => {
    await request(app.getHttpServer())
      .post('/api/mcp/message?sessionId=s-1&sessionToken=t-1&sessionKey=session-key')
      .send({
        jsonrpc: '2.0',
        id: '1',
        method: 'tools/list',
      })
      .expect(201)
      .expect({
        status: 'ok',
      });

    expect(mcpSessionService.validateSession).toHaveBeenCalledWith(
      's-1',
      'session-key',
      't-1',
    );
    expect(mcpSessionService.enqueueEvent).toHaveBeenCalledWith(
      's-1',
      expect.stringContaining('"tools"'),
    );
  });

  it('MCP tools/call 应映射 capability execution', async () => {
    await request(app.getHttpServer())
      .post('/api/mcp/message?sessionId=s-1&sessionToken=t-1&sessionKey=session-key')
      .send({
        jsonrpc: '2.0',
        id: '2',
        method: 'tools/call',
        params: {
          name: 'knowledge.search',
          arguments: { query: 'platform' },
        },
      })
      .expect(201);

    expect(executionService.execute).toHaveBeenCalledWith(
      'knowledge.search',
      { query: 'platform' },
      expect.objectContaining({
        principal: expect.objectContaining({
          userId: 'user-1',
        }),
      }),
    );
    expect(mcpSessionService.enqueueEvent).toHaveBeenCalledWith(
      's-1',
      expect.stringContaining('viking://knowledge/doc-1'),
    );
  });
});
