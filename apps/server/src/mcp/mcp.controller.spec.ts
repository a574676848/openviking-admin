import { McpController } from './mcp.controller';
import type { AuthenticatedRequest } from '../common/authenticated-request.interface';

describe('McpController audit', () => {
  const mcpService = {
    createCapabilityKey: jest.fn(),
    deleteCapabilityKey: jest.fn(),
  };
  const mcpProtocolService = {
    createSessionConnection: jest.fn(),
    handleMessage: jest.fn(),
  };
  const mcpSseService = {
    createEventStream: jest.fn(),
  };
  const auditService = {
    log: jest.fn(),
  };
  const controller = new McpController(
    mcpService as never,
    mcpProtocolService as never,
    mcpSseService as never,
    auditService as never,
  );
  const req = {
    user: { id: 'user-1', username: 'alice', tenantId: 'tenant-alpha' },
    headers: { 'x-request-id': 'request-1' },
    ip: '127.0.0.1',
  } as unknown as AuthenticatedRequest;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('创建 capability key 后应写入审计日志', async () => {
    mcpService.createCapabilityKey.mockResolvedValue({
      id: 'key-1',
      name: 'CLI Key',
    });

    await controller.createMyCapabilityKey(req, { name: 'CLI Key' });

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'create_capability_key',
        target: 'key-1',
        tenantId: 'tenant-alpha',
      }),
    );
  });

  it('删除 capability key 后应写入审计日志', async () => {
    mcpService.deleteCapabilityKey.mockResolvedValue({ success: true });

    await controller.deleteMyCapabilityKey(req, 'key-1');

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'delete_capability_key',
        target: 'key-1',
      }),
    );
  });
});
