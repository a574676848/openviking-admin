import { IntegrationController } from './integration.controller';
import type { AuthenticatedRequest } from '../common/authenticated-request.interface';

describe('IntegrationController', () => {
  const service = {
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    mask: jest.fn((value) => value),
  };
  const auditService = {
    log: jest.fn(),
  };
  const controller = new IntegrationController(
    service as never,
    auditService as never,
  );
  const req = {
    tenantScope: 'tenant-alpha',
    user: { id: 'user-1', username: 'alice' },
    headers: { 'x-request-id': 'request-1' },
    ip: '127.0.0.1',
  } as unknown as AuthenticatedRequest;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('create 后应写入审计日志', async () => {
    service.create.mockResolvedValue({
      id: 'integration-1',
      name: 'GitHub',
      type: 'github',
    });

    await controller.create(
      { name: 'GitHub', type: 'github', credentials: {} } as never,
      req,
    );

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'create_integration',
        target: 'integration-1',
        tenantId: 'tenant-alpha',
      }),
    );
  });

  it('remove 后应写入审计日志', async () => {
    service.remove.mockResolvedValue({ ok: true });

    await controller.remove('integration-1', req);

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'delete_integration',
        target: 'integration-1',
      }),
    );
  });
});
