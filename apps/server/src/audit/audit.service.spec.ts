import { AuditService } from './audit.service';
import { IAuditLogRepository } from './domain/repositories/audit-log.repository.interface';

describe('AuditService', () => {
  const repo = {
    save: jest.fn(),
    findAndCount: jest.fn(),
    getStats: jest.fn(),
  };

  const service = new AuditService(
    repo as unknown as IAuditLogRepository,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should persist audit entries through repository', async () => {
    repo.save.mockResolvedValue({ id: 'audit-1' });

    await service.log({
      tenantId: 'tenant-1',
      userId: 'user-1',
      username: 'alice',
      action: 'capability.invoke',
      target: 'knowledge.search',
      success: true,
      meta: { traceId: 'trace-1' },
    });

    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        action: 'capability.invoke',
        success: true,
      }),
    );
  });
});
