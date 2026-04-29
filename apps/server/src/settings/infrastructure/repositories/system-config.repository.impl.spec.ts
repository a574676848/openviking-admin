import { SystemConfigRepositoryImpl } from './system-config.repository.impl';

describe('SystemConfigRepositoryImpl', () => {
  it('请求上下文带 tenantDataSource 时也应始终使用公共库仓储', async () => {
    const defaultRepo = {
      findOne: jest.fn().mockResolvedValue({
        key: 'DEFAULT_OV_CONFIG',
        value: '{}',
        description: '默认配置',
        updatedAt: new Date('2026-04-27T00:00:00.000Z'),
      }),
      find: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
    };
    const tenantRepo = {
      findOne: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
    };
    const request = {
      tenantDataSource: {
        getRepository: jest.fn(() => tenantRepo),
      },
      tenantQueryRunner: {
        manager: {
          getRepository: jest.fn(() => tenantRepo),
        },
      },
    };

    const repository = new SystemConfigRepositoryImpl(
      request as never,
      defaultRepo as never,
    );

    const row = await repository.findOne({
      where: { key: 'DEFAULT_OV_CONFIG' },
    });

    expect(defaultRepo.findOne).toHaveBeenCalledWith({
      where: { key: 'DEFAULT_OV_CONFIG' },
    });
    expect(request.tenantDataSource.getRepository).not.toHaveBeenCalled();
    expect(
      request.tenantQueryRunner.manager.getRepository,
    ).not.toHaveBeenCalled();
    expect(row).toEqual(
      expect.objectContaining({
        key: 'DEFAULT_OV_CONFIG',
        value: '{}',
      }),
    );
  });
});
