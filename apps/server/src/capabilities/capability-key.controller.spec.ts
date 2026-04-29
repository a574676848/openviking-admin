import { CapabilityKeyController } from './capability-key.controller';
import type { AuthenticatedRequest } from '../common/authenticated-request.interface';

describe('CapabilityKeyController audit', () => {
  const capabilityKeyService = {
    createCapabilityKey: jest.fn(),
    getCapabilityKeysByTenant: jest.fn(),
    deleteCapabilityKey: jest.fn(),
  };
  const auditService = {
    log: jest.fn(),
  };
  const controller = new CapabilityKeyController(
    capabilityKeyService as never,
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
    capabilityKeyService.createCapabilityKey.mockResolvedValue({
      id: 'key-1',
      name: 'CLI Key',
    });

    await controller.createCapabilityKey(req, {
      userId: 'user-2',
      name: 'CLI Key',
      ttlSeconds: 2_592_000,
    });

    expect(capabilityKeyService.createCapabilityKey).toHaveBeenCalledWith(
      'user-2',
      'tenant-alpha',
      'CLI Key',
      2_592_000,
    );

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'create_capability_key',
        target: 'key-1',
        tenantId: 'tenant-alpha',
      }),
    );
  });

  it('查询 capability key 应返回当前租户全部凭证', async () => {
    capabilityKeyService.getCapabilityKeysByTenant.mockResolvedValue([
      { id: 'key-1', userId: 'user-1' },
      { id: 'key-2', userId: 'user-2' },
    ]);

    await expect(controller.getCapabilityKeys(req)).resolves.toEqual([
      { id: 'key-1', userId: 'user-1' },
      { id: 'key-2', userId: 'user-2' },
    ]);
    expect(capabilityKeyService.getCapabilityKeysByTenant).toHaveBeenCalledWith('tenant-alpha');
  });

  it('删除 capability key 后应写入审计日志', async () => {
    capabilityKeyService.deleteCapabilityKey.mockResolvedValue({ success: true });

    await controller.deleteCapabilityKey(req, 'key-1');

    expect(capabilityKeyService.deleteCapabilityKey).toHaveBeenCalledWith(
      'key-1',
      'tenant-alpha',
    );

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'delete_capability_key',
        target: 'key-1',
      }),
    );
  });
});
