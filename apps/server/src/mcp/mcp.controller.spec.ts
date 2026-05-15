import { McpController } from './mcp.controller';

describe('McpController', () => {
  const mcpProtocolService = {
    createSessionConnection: jest.fn(),
    handleMessage: jest.fn(),
  };
  const mcpSseService = {
    createEventStream: jest.fn(),
    writeEventStream: jest.fn(),
  };
  const controller = new McpController(
    mcpProtocolService as never,
    mcpSseService as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('MCP message 入口应透传协议请求', async () => {
    const body = { jsonrpc: '2.0', id: 1, method: 'tools/list' } as never;
    const response = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
    };
    mcpProtocolService.handleMessage.mockResolvedValue({ ok: true });

    await controller.handleMessage(
      'session-1',
      'token-1',
      'api-key',
      undefined,
      body,
      response as never,
    );

    expect(mcpProtocolService.handleMessage).toHaveBeenCalledWith(
      {
        sessionId: 'session-1',
        sessionToken: 'token-1',
        key: 'api-key',
        sessionKey: undefined,
      },
      body,
    );
    expect(response.status).toHaveBeenCalledWith(202);
    expect(response.send).toHaveBeenCalledWith('Accepted');
  });

  it('MCP SSE 入口应先创建会话再写入事件流', async () => {
    const request = {};
    const response = {};
    const session = { sessionId: 'session-1', endpoint: '/api/v1/mcp/message' };
    mcpProtocolService.createSessionConnection.mockResolvedValue(session);

    await controller.sse(
      'api-key',
      undefined,
      request as never,
      response as never,
    );

    expect(mcpProtocolService.createSessionConnection).toHaveBeenCalledWith(
      'api-key',
      undefined,
    );
    expect(mcpSseService.writeEventStream).toHaveBeenCalledWith(
      request,
      response,
      session,
    );
  });
});
