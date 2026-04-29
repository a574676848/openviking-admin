import { AuditLogRepositoryImpl } from './audit-log.repository.impl';

describe('AuditLogRepositoryImpl', () => {
  it('请求上下文带 tenantDataSource 时也应始终使用公共库仓储', async () => {
    const defaultRepo = {
      save: jest.fn().mockResolvedValue({
        id: 'audit-1',
        tenantId: 'mem',
        userId: 'user-1',
        username: 'admin',
        action: 'create_knowledge_base',
        target: 'kb-1',
        meta: null,
        ip: '127.0.0.1',
        success: true,
        createdAt: new Date('2026-04-27T00:00:00.000Z'),
      }),
      create: jest.fn((value) => value),
      findAndCount: jest.fn(),
      createQueryBuilder: jest.fn(),
    };
    const tenantScopedRepo = {
      save: jest.fn(),
      create: jest.fn(),
    };
    const request = {
      tenantDataSource: {
        getRepository: jest.fn(() => tenantScopedRepo),
      },
      tenantQueryRunner: {
        manager: {
          getRepository: jest.fn(() => tenantScopedRepo),
        },
      },
    };

    const repository = new AuditLogRepositoryImpl(
      request as never,
      defaultRepo as never,
    );

    const result = await repository.save({
      tenantId: 'mem',
      userId: 'user-1',
      username: 'admin',
      action: 'create_knowledge_base',
      target: 'kb-1',
      ip: '127.0.0.1',
      success: true,
    });

    expect(defaultRepo.create).toHaveBeenCalled();
    expect(defaultRepo.save).toHaveBeenCalled();
    expect(request.tenantDataSource.getRepository).not.toHaveBeenCalled();
    expect(
      request.tenantQueryRunner.manager.getRepository,
    ).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        id: 'audit-1',
        tenantId: 'mem',
      }),
    );
  });
});
