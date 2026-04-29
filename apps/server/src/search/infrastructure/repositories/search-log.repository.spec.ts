import { SearchLogRepository } from './search-log.repository';

describe('SearchLogRepository', () => {
  it('应固定使用公共库仓库而不是租户路由仓库', async () => {
    const defaultRepo = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({
        id: 'log-1',
        tenantId: 'tenant-a',
        query: 'WebDAV',
        scope: 'viking://docs/webdav',
        resultCount: 1,
        scoreMax: 0.88,
        latencyMs: 120,
        feedback: null,
        feedbackNote: null,
        meta: { rerank_applied: true },
        createdAt: new Date('2026-04-28T00:00:00.000Z'),
        ...value,
      })),
      count: jest.fn(async () => 1),
      find: jest.fn(async () => []),
      createQueryBuilder: jest.fn(),
    };

    const repository = new SearchLogRepository(
      defaultRepo as never,
    );

    await repository.save({
      tenantId: 'tenant-a',
      query: 'WebDAV',
      scope: 'viking://docs/webdav',
      resultCount: 1,
    });

    expect(defaultRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-a',
        query: 'WebDAV',
      }),
    );
    expect(defaultRepo.save).toHaveBeenCalledTimes(1);
  });

  it('高频 URI 统计应把空 scope 归并为 viking://*', async () => {
    const queryBuilder = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      setParameter: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([
        { uri: 'viking://*', count: '3', hits: '2' },
        { uri: 'viking://docs/webdav', count: '2', hits: '2' },
      ]),
    };
    const defaultRepo = {
      create: jest.fn(),
      save: jest.fn(),
      count: jest.fn(),
      find: jest.fn(),
      createQueryBuilder: jest.fn(() => queryBuilder),
    };

    const repository = new SearchLogRepository(defaultRepo as never);

    const result = await repository.getTopUris(null, 10);

    expect(queryBuilder.select).toHaveBeenCalledWith(
      "COALESCE(NULLIF(l.scope, ''), :allScope)",
      'uri',
    );
    expect(queryBuilder.setParameter).toHaveBeenCalledWith(
      'allScope',
      'viking://*',
    );
    expect(queryBuilder.groupBy).toHaveBeenCalledWith(
      "COALESCE(NULLIF(l.scope, ''), :allScope)",
    );
    expect(result).toEqual([
      { uri: 'viking://*', count: 3, hits: 2, hitRate: 66.7 },
      { uri: 'viking://docs/webdav', count: 2, hits: 2, hitRate: 100 },
    ]);
  });
});
