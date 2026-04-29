import { McpController } from './mcp.controller';

describe('McpController', () => {
  const mcpProtocolService = {
    createSessionConnection: jest.fn(),
    handleMessage: jest.fn(),
  };
  const mcpSseService = {
    createEventStream: jest.fn(),
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
    mcpProtocolService.handleMessage.mockResolvedValue({ ok: true });

    await expect(
      controller.handleMessage('session-1', 'token-1', 'api-key', undefined, body),
    ).resolves.toEqual({ ok: true });
    expect(mcpProtocolService.handleMessage).toHaveBeenCalledWith(
      {
        sessionId: 'session-1',
        sessionToken: 'token-1',
        key: 'api-key',
        sessionKey: undefined,
      },
      body,
    );
  });
});
