import { TenantRepository } from './tenant.repository';

describe('TenantRepository', () => {
  it('请求上下文带 tenantDataSource 时也应始终使用公共库仓储', async () => {
    const defaultRepo = {
      find: jest.fn().mockResolvedValue([
        {
          id: 'tenant-1',
          tenantId: 'mem',
          displayName: '记忆系统',
          status: 'active',
          isolationLevel: 'large',
          dbConfig: null,
          vikingAccount: null,
          quota: null,
          ovConfig: null,
          description: null,
          createdAt: new Date('2026-04-27T00:00:00.000Z'),
          updatedAt: new Date('2026-04-27T00:00:00.000Z'),
          deletedAt: null,
        },
      ]),
      findOne: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
      delete: jest.fn(),
      create: jest.fn(),
    };
    const tenantScopedRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
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

    const repository = new TenantRepository(
      request as never,
      defaultRepo as never,
    );

    const result = await repository.findAll();

    expect(defaultRepo.find).toHaveBeenCalledWith({
      order: { createdAt: 'DESC' },
    });
    expect(request.tenantDataSource.getRepository).not.toHaveBeenCalled();
    expect(
      request.tenantQueryRunner.manager.getRepository,
    ).not.toHaveBeenCalled();
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(
      expect.objectContaining({
        id: 'tenant-1',
        tenantId: 'mem',
      }),
    );
  });

  it('按主键查询租户时若传入业务编码应直接返回 null 而不是触发 UUID 查询', async () => {
    const defaultRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
      delete: jest.fn(),
      create: jest.fn(),
    };

    const repository = new TenantRepository({} as never, defaultRepo as never);

    const result = await repository.findById('mem');

    expect(result).toBeNull();
    expect(defaultRepo.findOne).not.toHaveBeenCalled();
  });
});
