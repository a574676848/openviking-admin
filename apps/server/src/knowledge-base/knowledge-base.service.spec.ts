import { HttpException, NotFoundException } from '@nestjs/common';
import { KnowledgeBaseService } from './knowledge-base.service';

describe('KnowledgeBaseService', () => {
  const kbRepo = {
    findAll: jest.fn(),
    findById: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
    createWithUri: jest.fn(),
  };
  const tenantService = {
    findOne: jest.fn(),
    findOneByIdOrTenantId: jest.fn(),
  };
  const knowledgeTreeService = {
    findByKb: jest.fn(),
    remove: jest.fn(),
  };
  const settingsService = {
    resolveOVConfig: jest.fn(),
  };
  const ovClientService = {
    request: jest.fn(),
  };
  const service = new KnowledgeBaseService(
    kbRepo as never,
    tenantService as never,
    knowledgeTreeService as never,
    settingsService as never,
    ovClientService as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    settingsService.resolveOVConfig.mockResolvedValue({
      baseUrl: 'https://ov.example.com',
      apiKey: 'ov-sk-test',
      account: 'tenant-alpha',
      user: null,
    });
  });

  it('跨租户查询知识库时应拒绝访问', async () => {
    kbRepo.findById.mockResolvedValue(null);

    await expect(service.findOne('kb-1', 'tenant-a')).rejects.toThrow(
      NotFoundException,
    );
    expect(kbRepo.findById).toHaveBeenCalledWith('kb-1', 'tenant-a');
  });

  it('读取知识库列表时应过滤归档项并按根目录实时刷新文档数与向量数', async () => {
    kbRepo.findAll.mockResolvedValue([
      {
        id: 'kb-1',
        tenantId: 'tenant-alpha',
        name: '知识库一',
        vikingUri: 'viking://resources/tenants/tenant-alpha/kb-1/',
        docCount: 0,
        vectorCount: 0,
        status: 'active',
      },
      {
        id: 'kb-archived',
        tenantId: 'tenant-alpha',
        name: '已归档知识库',
        vikingUri: 'viking://resources/tenants/tenant-alpha/kb-archived/',
        docCount: 9,
        vectorCount: 9,
        status: 'archived',
      },
    ]);
    ovClientService.request
      .mockResolvedValueOnce({
        result: [
          { isDir: true },
          { isDir: false },
          { isDir: false },
        ],
      })
      .mockResolvedValueOnce({
        result: { count: 7 },
      });
    kbRepo.save.mockImplementation(async (payload) => payload);

    const result = await service.findAllWithRuntimeStats('tenant-alpha');

    expect(ovClientService.request).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ account: 'tenant-alpha' }),
      '/api/v1/fs/tree?uri=viking%3A%2F%2Fresources%2Ftenants%2Ftenant-alpha%2Fkb-1%2F',
      'GET',
      undefined,
      { user: undefined },
    );
    expect(ovClientService.request).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ account: 'tenant-alpha' }),
      '/api/v1/debug/vector/count?uri=viking%3A%2F%2Fresources%2Ftenants%2Ftenant-alpha%2Fkb-1%2F',
      'GET',
      undefined,
      { user: undefined },
    );
    expect(kbRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'kb-1',
        docCount: 2,
        vectorCount: 7,
      }),
    );
    expect(result).toEqual([
      expect.objectContaining({
        id: 'kb-1',
        docCount: 2,
        vectorCount: 7,
      }),
    ]);
  });

  it('读取单个知识库时若已归档应返回不存在', async () => {
    kbRepo.findById.mockResolvedValue({
      id: 'kb-archived',
      tenantId: 'tenant-alpha',
      name: '已归档知识库',
      status: 'archived',
      vikingUri: 'viking://resources/tenants/tenant-alpha/kb-archived/',
      docCount: 1,
      vectorCount: 1,
    });

    await expect(
      service.findOne('kb-archived', 'tenant-alpha'),
    ).rejects.toThrow(NotFoundException);
  });

  it('读取单个知识库时若根目录已不存在应将统计归零', async () => {
    kbRepo.findById.mockResolvedValue({
      id: 'kb-missing',
      tenantId: 'tenant-alpha',
      name: '空知识库',
      vikingUri: 'viking://resources/tenants/tenant-alpha/kb-missing/',
      docCount: 9,
      vectorCount: 18,
    });
    ovClientService.request.mockRejectedValueOnce(
      new HttpException('不存在', 404),
    );
    kbRepo.save.mockImplementation(async (payload) => payload);

    const result = await service.findOneWithRuntimeStats(
      'kb-missing',
      'tenant-alpha',
    );

    expect(kbRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'kb-missing',
        docCount: 0,
        vectorCount: 0,
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        id: 'kb-missing',
        docCount: 0,
        vectorCount: 0,
      }),
    );
  });

  it('跨租户更新知识库时应拒绝访问', async () => {
    kbRepo.findById.mockResolvedValue(null);

    await expect(
      service.update('kb-1', { name: '新的名称' }, 'tenant-a'),
    ).rejects.toThrow(NotFoundException);
  });

  it('跨租户删除知识库时应拒绝访问', async () => {
    kbRepo.findById.mockResolvedValue(null);

    await expect(service.remove('kb-1', 'tenant-a')).rejects.toThrow(
      NotFoundException,
    );
    expect(kbRepo.delete).not.toHaveBeenCalled();
  });

  it('创建知识库时应支持用业务 tenantId 解析租户', async () => {
    tenantService.findOneByIdOrTenantId.mockResolvedValue({
      id: 'tenant-1',
      tenantId: 'mem',
      quota: { maxDocs: 10 },
    });
    kbRepo.findAll.mockResolvedValue([
      {
        id: 'kb-active',
        tenantId: 'mem',
        name: '可见知识库',
        status: 'active',
      },
      {
        id: 'kb-archived',
        tenantId: 'mem',
        name: '已归档知识库',
        status: 'archived',
      },
    ]);
    kbRepo.createWithUri.mockResolvedValue({
      id: 'kb-1',
      tenantId: 'mem',
      name: '记忆',
    });

    const result = await service.create({
      name: '记忆',
      description: '',
      tenantId: 'mem',
      vikingUri: 'viking://resources/mem/',
    });

    expect(tenantService.findOneByIdOrTenantId).toHaveBeenCalledWith('mem');
    expect(kbRepo.findAll).toHaveBeenCalledWith('mem');
    expect(kbRepo.createWithUri).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'mem', name: '记忆' }),
    );
    expect(result).toEqual(
      expect.objectContaining({ id: 'kb-1', tenantId: 'mem' }),
    );
  });

  it('删除知识库时应先递归删除 OpenViking 根资源，再删除 Admin 元数据', async () => {
    kbRepo.findById.mockResolvedValue({
      id: 'kb-1',
      tenantId: 'tenant-alpha',
      name: '记忆',
      vikingUri: 'viking://resources/tenants/tenant-alpha/kb-1/',
    });
    knowledgeTreeService.findByKb.mockResolvedValue([
      { id: 'root-node', parentId: null },
      { id: 'child-node', parentId: 'root-node' },
    ]);
    knowledgeTreeService.remove.mockResolvedValue(undefined);
    ovClientService.request.mockResolvedValue({});

    await service.remove('kb-1', 'tenant-alpha', { user: 'admin' });

    expect(knowledgeTreeService.remove).toHaveBeenCalledWith(
      'root-node',
      'tenant-alpha',
      {
        ovConfig: {
          baseUrl: 'https://ov.example.com',
          apiKey: 'ov-sk-test',
          account: 'tenant-alpha',
          user: 'admin',
        },
        user: 'admin',
        skipOpenViking: true,
      },
    );
    expect(knowledgeTreeService.remove).not.toHaveBeenCalledWith(
      'child-node',
      expect.anything(),
      expect.anything(),
    );
    expect(ovClientService.request).toHaveBeenCalledWith(
      {
        baseUrl: 'https://ov.example.com',
        apiKey: 'ov-sk-test',
        account: 'tenant-alpha',
        user: 'admin',
      },
      '/api/v1/fs?uri=viking%3A%2F%2Fresources%2Ftenants%2Ftenant-alpha%2Fkb-1%2F&recursive=true',
      'DELETE',
      undefined,
      { user: 'admin' },
      { serviceLabel: 'OpenViking 资源删除' },
    );
    expect(ovClientService.request.mock.invocationCallOrder[0]).toBeLessThan(
      knowledgeTreeService.remove.mock.invocationCallOrder[0],
    );
    expect(
      knowledgeTreeService.remove.mock.invocationCallOrder[0],
    ).toBeLessThan(kbRepo.delete.mock.invocationCallOrder[0]);
  });

  it('删除知识库遇到 OpenViking 404 时应继续删除本地元数据', async () => {
    kbRepo.findById.mockResolvedValue({
      id: 'kb-1',
      tenantId: 'tenant-alpha',
      name: '记忆',
      vikingUri: 'viking://resources/tenants/tenant-alpha/kb-1/',
    });
    knowledgeTreeService.findByKb.mockResolvedValue([]);
    ovClientService.request.mockRejectedValue(new HttpException('不存在', 404));

    await service.remove('kb-1', 'tenant-alpha');

    expect(kbRepo.delete).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'kb-1' }),
    );
  });
});
