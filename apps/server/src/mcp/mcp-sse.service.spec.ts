import { McpSseService } from './mcp-sse.service';

describe('McpSseService', () => {
  const mcpSessionService = {
    pullPendingEvents: jest.fn(),
    touchSession: jest.fn(),
    closeSession: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mcpSessionService.pullPendingEvents.mockResolvedValue([]);
    mcpSessionService.touchSession.mockResolvedValue(undefined);
    mcpSessionService.closeSession.mockResolvedValue(undefined);
  });

  it('会话创建失败时应通过 SSE error 事件返回，不抛给全局异常过滤器', async () => {
    const service = new McpSseService(mcpSessionService as never);
    const request = { on: jest.fn() };
    const events: Array<{ type?: string; data: unknown }> = [];

    const subscription = service
      .createEventStream(
        request as never,
        async () => {
          throw new Error('无效的 capability apiKey');
        },
      )
      .subscribe({
        next: (event) => events.push(event),
      });

    await new Promise((resolve) => setImmediate(resolve));

    expect(events).toEqual([
      {
        type: 'error',
        data: '无效的 capability apiKey',
      },
    ]);
    subscription.unsubscribe();
  });

  it('手动 SSE 写入时应先输出 endpoint 事件', async () => {
    const service = new McpSseService(mcpSessionService as never);
    const request = { on: jest.fn() };
    const response = {
      setHeader: jest.fn(),
      flushHeaders: jest.fn(),
      write: jest.fn(),
      end: jest.fn(),
    };

    let closeHandler: (() => void) | undefined;
    request.on.mockImplementation((event: string, handler: () => void) => {
      if (event === 'close') {
        closeHandler = handler;
      }
      return request;
    });

    service.writeEventStream(
      request as never,
      response as never,
      { sessionId: 'session-1', endpoint: '/api/v1/mcp/message?sessionId=session-1' },
    );

    await new Promise((resolve) => setImmediate(resolve));

    expect(response.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'text/event-stream; charset=utf-8',
    );
    expect(response.write).toHaveBeenCalledWith(
      'event: endpoint\ndata: /api/v1/mcp/message?sessionId=session-1\n\n',
    );
    closeHandler?.();
  });

  it('待投递 JSON-RPC 响应应按官方 SSE message 事件输出', async () => {
    mcpSessionService.pullPendingEvents.mockResolvedValueOnce([
      {
        payload: '{"jsonrpc":"2.0","id":1,"result":{}}',
        type: undefined,
      },
    ]);
    const service = new McpSseService(mcpSessionService as never);
    const request = { on: jest.fn() };
    const events: Array<{ type?: string; data: unknown }> = [];

    const subscription = service
      .createEventStream(
        request as never,
        async () => ({
          sessionId: 'session-1',
          endpoint: '/api/v1/mcp/message?sessionId=session-1',
        }),
      )
      .subscribe({
        next: (event) => events.push(event),
      });

    await new Promise((resolve) => setImmediate(resolve));

    expect(events).toContainEqual({
      type: 'message',
      data: '{"jsonrpc":"2.0","id":1,"result":{}}',
    });
    subscription.unsubscribe();
  });
});
