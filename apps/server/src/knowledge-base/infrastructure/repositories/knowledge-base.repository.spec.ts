import { TypeOrmKnowledgeBaseRepository } from './knowledge-base.repository';
import { KnowledgeBase } from '../../entities/knowledge-base.entity';

describe('TypeOrmKnowledgeBaseRepository', () => {
  const createQueryRunner = () => ({
    isReleased: false,
    isTransactionActive: false,
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    manager: {
      create: jest.fn((_entity, input) => input),
      save: jest.fn(async (entity) => ({
        ...entity,
        id: 'kb-1',
        description: entity.description ?? '',
        vikingUri: entity.vikingUri ?? null,
        docCount: entity.docCount ?? 0,
        vectorCount: entity.vectorCount ?? 0,
        createdAt: new Date('2026-04-29T00:00:00.000Z'),
        updatedAt: new Date('2026-04-29T00:00:00.000Z'),
      })),
      update: jest.fn(),
      getRepository: jest.fn(),
    },
  });

  it('MEDIUM 租户创建知识库时应复用请求 QueryRunner，避免落入 public schema', async () => {
    const tenantQueryRunner = createQueryRunner();
    const defaultQueryRunner = createQueryRunner();
    const defaultRepo = {
      manager: {
        connection: {
          createQueryRunner: jest.fn(() => defaultQueryRunner),
        },
      },
    };
    const repository = new TypeOrmKnowledgeBaseRepository(
      { tenantQueryRunner } as never,
      defaultRepo as never,
    );

    const result = await repository.createWithUri({
      name: '测试知识库',
      tenantId: 'test3',
      status: 'active',
    });

    expect(defaultRepo.manager.connection.createQueryRunner).not.toHaveBeenCalled();
    expect(tenantQueryRunner.manager.create).toHaveBeenCalledWith(
      KnowledgeBase,
      expect.objectContaining({ tenantId: 'test3' }),
    );
    expect(tenantQueryRunner.manager.update).toHaveBeenCalledWith(
      KnowledgeBase,
      'kb-1',
      { vikingUri: 'viking://resources/test3/kb-1/' },
    );
    expect(tenantQueryRunner.release).not.toHaveBeenCalled();
    expect(result.vikingUri).toBe('viking://resources/test3/kb-1/');
  });

  it('LARGE 租户创建知识库时应从租户 DataSource 创建事务', async () => {
    const tenantQueryRunner = createQueryRunner();
    const defaultQueryRunner = createQueryRunner();
    const tenantDataSource = {
      createQueryRunner: jest.fn(() => tenantQueryRunner),
    };
    const defaultRepo = {
      manager: {
        connection: {
          createQueryRunner: jest.fn(() => defaultQueryRunner),
        },
      },
    };
    const repository = new TypeOrmKnowledgeBaseRepository(
      { tenantDataSource } as never,
      defaultRepo as never,
    );

    await repository.createWithUri({
      name: '测试知识库',
      tenantId: 'large-test',
      status: 'active',
    });

    expect(tenantDataSource.createQueryRunner).toHaveBeenCalledTimes(1);
    expect(defaultRepo.manager.connection.createQueryRunner).not.toHaveBeenCalled();
    expect(tenantQueryRunner.connect).toHaveBeenCalledTimes(1);
    expect(tenantQueryRunner.release).toHaveBeenCalledTimes(1);
  });
});
