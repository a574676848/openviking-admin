import { McpSessionService } from './mcp-session.service';

describe('McpSessionService', () => {
  const sessionRepo = {
    save: jest.fn(),
    create: jest.fn((payload) => payload),
    update: jest.fn(),
    delete: jest.fn(),
  };
  const eventRepo = {
    save: jest.fn(),
    create: jest.fn((payload) => payload),
    find: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    sessionRepo.delete.mockResolvedValue({ affected: 0 });
    eventRepo.delete.mockResolvedValue({ affected: 0 });
    sessionRepo.save.mockImplementation(async (payload) => payload);
  });

  it('创建 SSE 会话时应返回带 API 版本前缀的 message endpoint', async () => {
    const service = new McpSessionService(
      sessionRepo as never,
      eventRepo as never,
    );

    const session = await service.createSession('ov-sk-demo');

    expect(session.endpoint).toContain('/api/v1/mcp/message?');
    expect(session.endpoint).toContain('key=ov-sk-demo');
  });
});
