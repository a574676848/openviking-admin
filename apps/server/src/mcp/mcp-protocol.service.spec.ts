import { McpProtocolService } from './mcp-protocol.service';

describe('McpProtocolService', () => {
  const principal = {
    userId: 'user-1',
    username: 'alice',
    tenantId: 'tenant-1',
    role: 'tenant_admin',
    scope: 'tenant',
    credentialType: 'api_key',
    clientType: 'service',
  };

  const mcpSessionService = {
    createSession: jest.fn(),
    validateSession: jest.fn(),
    enqueueEvent: jest.fn(),
  };
  const capabilityCatalogService = {
    toMcpToolsForPrincipal: jest.fn(() => [{ name: 'knowledge.search' }]),
  };
  const capabilityExecutionService = {
    execute: jest.fn(async () => ({ data: { items: [] } })),
  };
  const capabilityObservabilityService = {
    createTraceContext: jest.fn(() => ({ traceId: 'trace-1' })),
  };
  const capabilityCredentialService = {
    resolvePrincipalFromApiKey: jest.fn(async () => principal),
    resolvePrincipalFromJwt: jest.fn(async () => principal),
  };

  const service = new McpProtocolService(
    mcpSessionService as never,
    capabilityCatalogService as never,
    capabilityExecutionService as never,
    capabilityObservabilityService as never,
    capabilityCredentialService as never,
  );

  const query = {
    sessionId: 'session-1',
    sessionToken: 'token-1',
    key: 'api-key',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function parseQueuedPayload() {
    return JSON.parse(mcpSessionService.enqueueEvent.mock.calls[0][1]);
  }

  it('应按 JSON-RPC 2.0 返回 tools/list 结果', async () => {
    await expect(
      service.handleMessage(query, {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
      }),
    ).resolves.toEqual({ status: 'ok' });

    expect(parseQueuedPayload()).toEqual({
      jsonrpc: '2.0',
      id: 1,
      result: {
        tools: [{ name: 'knowledge.search' }],
      },
    });
    expect(capabilityCatalogService.toMcpToolsForPrincipal).toHaveBeenCalledWith(
      principal,
    );
  });

  it('无 id 的 notification 不应写入 JSON-RPC 响应事件', async () => {
    await expect(
      service.handleMessage(query, {
        jsonrpc: '2.0',
        method: 'notifications/initialized',
      }),
    ).resolves.toEqual({ status: 'accepted' });

    expect(mcpSessionService.enqueueEvent).not.toHaveBeenCalled();
  });

  it('无效 jsonrpc 版本应返回 Invalid Request', async () => {
    await expect(
      service.handleMessage(query, {
        jsonrpc: '1.0',
        id: 'req-1',
        method: 'tools/list',
      }),
    ).resolves.toEqual({ status: 'error', message: 'Invalid Request' });

    expect(parseQueuedPayload()).toEqual({
      jsonrpc: '2.0',
      id: 'req-1',
      error: {
        code: -32600,
        message: 'Invalid Request',
      },
    });
  });

  it('未知方法应返回 Method not found', async () => {
    await service.handleMessage(query, {
      jsonrpc: '2.0',
      id: 'req-2',
      method: 'unknown/method',
    });

    expect(parseQueuedPayload()).toEqual({
      jsonrpc: '2.0',
      id: 'req-2',
      error: {
        code: -32601,
        message: 'Method not found',
      },
    });
  });

  it('tools/call 缺少 name 时应返回 Invalid params', async () => {
    await service.handleMessage(query, {
      jsonrpc: '2.0',
      id: 'req-3',
      method: 'tools/call',
      params: {},
    });

    expect(parseQueuedPayload()).toEqual({
      jsonrpc: '2.0',
      id: 'req-3',
      error: {
        code: -32602,
        message: 'Invalid params',
      },
    });
  });
});
