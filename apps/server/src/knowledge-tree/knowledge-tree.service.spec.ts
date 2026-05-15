import { BadRequestException, HttpException } from '@nestjs/common';
import { KnowledgeTreeService } from './knowledge-tree.service';

describe('KnowledgeTreeService', () => {
  const nodeRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    createWithGeneratedUri: jest.fn(),
    createFileWithGeneratedUri: jest.fn(),
    remove: jest.fn(),
    findAllowedUris: jest.fn(),
  };
  const settingsService = {
    resolveOVConfig: jest.fn(),
  };
  const ovClientService = {
    request: jest.fn(),
  };
  const documentSessionRegistry = {
    assertNoActiveSessionInNodes: jest.fn(),
  };

  const service = new KnowledgeTreeService(
    nodeRepo as never,
    settingsService as never,
    ovClientService as never,
    documentSessionRegistry as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    documentSessionRegistry.assertNoActiveSessionInNodes.mockReset();
    documentSessionRegistry.assertNoActiveSessionInNodes.mockImplementation(
      () => undefined,
    );
    settingsService.resolveOVConfig.mockResolvedValue({
      baseUrl: 'https://ov.example.com',
      apiKey: 'ov-sk-test',
      account: 'tenant-alpha',
      user: null,
    });
  });

  it('create 时应通过事务生成固定格式的 vikingUri', async () => {
    nodeRepo.createWithGeneratedUri.mockResolvedValue({
      id: 'node-1',
      tenantId: 'tenant-alpha',
      kbId: 'kb-1',
      name: '节点 A',
      vikingUri: 'viking://resources/tenant-alpha/kb-1/node-1/',
    });

    const created = await service.create({
      tenantId: 'tenant-alpha',
      kbId: 'kb-1',
      name: '节点 A',
    });

    expect(nodeRepo.createWithGeneratedUri).toHaveBeenCalledWith({
      tenantId: 'tenant-alpha',
      kbId: 'kb-1',
      name: '节点 A',
    });
    expect(created.vikingUri).toBe(
      'viking://resources/tenant-alpha/kb-1/node-1/',
    );
  });

  it('createFile 时应生成非目录文件 vikingUri', async () => {
    nodeRepo.createFileWithGeneratedUri.mockResolvedValue({
      id: 'node-file',
      tenantId: 'tenant-alpha',
      kbId: 'kb-1',
      name: '说明.md',
      vikingUri: 'viking://resources/tenant-alpha/kb-1/node-file.md',
    });

    const created = await service.createFile({
      tenantId: 'tenant-alpha',
      kbId: 'kb-1',
      name: '说明.md',
      fileExtension: '.md',
    });

    expect(nodeRepo.createFileWithGeneratedUri).toHaveBeenCalledWith({
      tenantId: 'tenant-alpha',
      kbId: 'kb-1',
      name: '说明.md',
      fileExtension: '.md',
    });
    expect(created.vikingUri).toBe(
      'viking://resources/tenant-alpha/kb-1/node-file.md',
    );
  });

  it('createFile 收到无后缀名称时应自动补齐 Markdown 后缀', async () => {
    nodeRepo.createFileWithGeneratedUri.mockResolvedValue({
      id: 'node-file',
      tenantId: 'tenant-alpha',
      kbId: 'kb-1',
      name: '说明.md',
      kind: 'document',
      vikingUri: 'viking://resources/tenant-alpha/kb-1/node-file/',
      contentUri: null,
    });

    await service.createFile({
      tenantId: 'tenant-alpha',
      kbId: 'kb-1',
      name: '说明',
      fileExtension: '.md',
    });

    expect(nodeRepo.createFileWithGeneratedUri).toHaveBeenCalledWith(
      expect.objectContaining({
        name: '说明.md',
        fileExtension: '.md',
      }),
    );
  });

  it('createFile 补齐 Markdown 后缀前应裁剪名称首尾空白', async () => {
    nodeRepo.createFileWithGeneratedUri.mockResolvedValue({
      id: 'node-file',
      tenantId: 'tenant-alpha',
      kbId: 'kb-1',
      name: '发布记录.md',
      kind: 'document',
      vikingUri: 'viking://resources/tenant-alpha/kb-1/node-file/',
      contentUri: null,
    });

    await service.createFile({
      tenantId: 'tenant-alpha',
      kbId: 'kb-1',
      name: ' 发布记录 ',
      fileExtension: '.md',
    });

    expect(nodeRepo.createFileWithGeneratedUri).toHaveBeenCalledWith(
      expect.objectContaining({
        name: '发布记录.md',
      }),
    );
  });

  it('createFile 收到已有后缀名称时不应重复补齐 Markdown 后缀', async () => {
    nodeRepo.createFileWithGeneratedUri.mockResolvedValue({
      id: 'node-file',
      tenantId: 'tenant-alpha',
      kbId: 'kb-1',
      name: 'README.markdown',
      kind: 'document',
      vikingUri: 'viking://resources/tenant-alpha/kb-1/node-file/',
      contentUri: null,
    });

    await service.createFile({
      tenantId: 'tenant-alpha',
      kbId: 'kb-1',
      name: 'README.markdown',
      fileExtension: '.md',
    });

    expect(nodeRepo.createFileWithGeneratedUri).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'README.markdown',
      }),
    );
  });

  it('update 时不允许修改 vikingUri', async () => {
    nodeRepo.findOne.mockResolvedValue({
      id: 'node-1',
      tenantId: 'tenant-alpha',
      kbId: 'kb-1',
      name: '节点 A',
      vikingUri: 'viking://resources/tenant-alpha/kb-1/node-1/',
    });

    await expect(
      service.update(
        'node-1',
        { vikingUri: 'viking://resources/tenant-alpha/kb-1/other/' },
        'tenant-alpha',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(nodeRepo.save).not.toHaveBeenCalled();
  });

  it('update 时应保留并保存 acl 变更', async () => {
    nodeRepo.findOne.mockResolvedValue({
      id: 'node-1',
      tenantId: 'tenant-alpha',
      kbId: 'kb-1',
      name: '节点 A',
      vikingUri: 'viking://resources/tenant-alpha/kb-1/node-1/',
      acl: { isPublic: true, roles: [], users: [] },
    });
    nodeRepo.save.mockImplementation(async (node) => node);

    const updated = await service.update(
      'node-1',
      {
        acl: {
          isPublic: false,
          roles: ['tenant_viewer'],
          users: ['user-1'],
        },
      },
      'tenant-alpha',
    );

    expect(nodeRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        acl: {
          isPublic: false,
          roles: ['tenant_viewer'],
          users: ['user-1'],
        },
      }),
    );
    expect(updated).toEqual(
      expect.objectContaining({
        acl: {
          isPublic: false,
          roles: ['tenant_viewer'],
          users: ['user-1'],
        },
      }),
    );
    expect(
      documentSessionRegistry.assertNoActiveSessionInNodes,
    ).not.toHaveBeenCalled();
  });

  it('update 移动节点前应检查目标子树活跃协作会话', async () => {
    nodeRepo.findOne.mockResolvedValue({
      id: 'node-1',
      tenantId: 'tenant-alpha',
      kbId: 'kb-1',
      parentId: 'parent-old',
      name: '节点 A',
      vikingUri: 'viking://resources/tenant-alpha/kb-1/node-1/',
    });
    nodeRepo.find.mockResolvedValue([]);
    documentSessionRegistry.assertNoActiveSessionInNodes.mockImplementation(
      () => {
        throw new HttpException('目标节点或子节点正在被协作编辑', 423);
      },
    );

    await expect(
      service.update('node-1', { parentId: 'parent-new' }, 'tenant-alpha'),
    ).rejects.toMatchObject({ status: 423 });

    expect(
      documentSessionRegistry.assertNoActiveSessionInNodes,
    ).toHaveBeenCalledWith(['node-1']);
    expect(nodeRepo.save).not.toHaveBeenCalled();
  });

  it('update 重命名节点前应检查目标子树活跃协作会话', async () => {
    nodeRepo.findOne.mockResolvedValue({
      id: 'node-1',
      tenantId: 'tenant-alpha',
      kbId: 'kb-1',
      parentId: null,
      name: '旧名称',
      vikingUri: 'viking://resources/tenant-alpha/kb-1/node-1/',
    });
    nodeRepo.find
      .mockResolvedValueOnce([
        {
          id: 'child-1',
          tenantId: 'tenant-alpha',
          kbId: 'kb-1',
          parentId: 'node-1',
          name: '子节点',
          vikingUri: 'viking://resources/tenant-alpha/kb-1/child-1/',
        },
      ])
      .mockResolvedValueOnce([]);
    nodeRepo.save.mockImplementation(async (node) => node);

    await service.update('node-1', { name: '新名称' }, 'tenant-alpha');

    expect(
      documentSessionRegistry.assertNoActiveSessionInNodes,
    ).toHaveBeenCalledWith(['node-1', 'child-1']);
  });

  it('touch 应只刷新节点更新时间', async () => {
    nodeRepo.findOne.mockResolvedValue({
      id: 'node-1',
      tenantId: 'tenant-alpha',
      kbId: 'kb-1',
      name: '节点 A',
      vikingUri: 'viking://resources/tenant-alpha/kb-1/node-1.md',
      updatedAt: new Date('2026-05-01T00:00:00.000Z'),
    });
    nodeRepo.save.mockImplementation(async (node) => node);

    const touched = await service.touch('node-1', 'tenant-alpha');

    expect(nodeRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'node-1',
        updatedAt: expect.any(Date),
      }),
    );
    expect(touched).toEqual(
      expect.objectContaining({
        id: 'node-1',
      }),
    );
  });

  it('syncContentUri 应通过内部入口更新正文叶子 URI', async () => {
    nodeRepo.findOne.mockResolvedValue({
      id: 'node-1',
      tenantId: 'tenant-alpha',
      kbId: 'kb-1',
      name: '说明.md',
      kind: 'document',
      vikingUri: 'viking://resources/tenants/tenant-alpha/kb-1/node-1/',
      contentUri: 'viking://resources/tenants/tenant-alpha/kb-1/node-1/old.md',
      updatedAt: new Date('2026-05-01T00:00:00.000Z'),
    });
    nodeRepo.save.mockImplementation(async (node) => node);

    const updated = await service.syncContentUri(
      'node-1',
      'viking://resources/tenants/tenant-alpha/kb-1/node-1/new.md',
      'tenant-alpha',
    );

    expect(nodeRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'node-1',
        contentUri:
          'viking://resources/tenants/tenant-alpha/kb-1/node-1/new.md',
        updatedAt: expect.any(Date),
      }),
    );
    expect(updated).toEqual(
      expect.objectContaining({
        contentUri:
          'viking://resources/tenants/tenant-alpha/kb-1/node-1/new.md',
      }),
    );
  });

  it('remove 应先删除 OpenViking 资源再删除节点元数据', async () => {
    nodeRepo.findOne.mockResolvedValue({
      id: 'node-file',
      tenantId: 'tenant-alpha',
      kbId: 'kb-1',
      parentId: null,
      name: '说明.md',
      vikingUri: 'viking://resources/tenants/tenant-alpha/kb-1/node-file.md',
    });
    nodeRepo.find.mockResolvedValue([]);
    ovClientService.request.mockResolvedValue({});

    await service.remove('node-file', 'tenant-alpha', { user: 'admin' });

    expect(ovClientService.request).toHaveBeenCalledWith(
      {
        baseUrl: 'https://ov.example.com',
        apiKey: 'ov-sk-test',
        account: 'tenant-alpha',
        user: 'admin',
      },
      '/api/v1/fs?uri=viking%3A%2F%2Fresources%2Ftenants%2Ftenant-alpha%2Fkb-1%2Fnode-file.md&recursive=false',
      'DELETE',
      undefined,
      { user: 'admin' },
      { serviceLabel: 'OpenViking 资源删除' },
    );
    expect(ovClientService.request.mock.invocationCallOrder[0]).toBeLessThan(
      nodeRepo.remove.mock.invocationCallOrder[0],
    );
  });

  it('remove 删除前应检查目标子树活跃协作会话', async () => {
    nodeRepo.findOne.mockResolvedValue({
      id: 'node-dir',
      tenantId: 'tenant-alpha',
      kbId: 'kb-1',
      parentId: null,
      name: '目录',
      vikingUri: 'viking://resources/tenants/tenant-alpha/kb-1/node-dir/',
    });
    nodeRepo.find
      .mockResolvedValueOnce([
        {
          id: 'child-doc',
          tenantId: 'tenant-alpha',
          kbId: 'kb-1',
          parentId: 'node-dir',
          name: '子文档',
          vikingUri: 'viking://resources/tenants/tenant-alpha/kb-1/child-doc/',
        },
      ])
      .mockResolvedValueOnce([]);
    documentSessionRegistry.assertNoActiveSessionInNodes.mockImplementation(
      () => {
        throw new HttpException('目标节点或子节点正在被协作编辑', 423);
      },
    );

    await expect(
      service.remove('node-dir', 'tenant-alpha'),
    ).rejects.toMatchObject({ status: 423 });

    expect(
      documentSessionRegistry.assertNoActiveSessionInNodes,
    ).toHaveBeenCalledWith(['node-dir', 'child-doc']);
    expect(settingsService.resolveOVConfig).not.toHaveBeenCalled();
    expect(ovClientService.request).not.toHaveBeenCalled();
    expect(nodeRepo.remove).not.toHaveBeenCalled();
  });

  it('remove 删除目录节点时应使用 recursive=true', async () => {
    nodeRepo.findOne.mockResolvedValue({
      id: 'node-dir',
      tenantId: 'tenant-alpha',
      kbId: 'kb-1',
      parentId: null,
      name: '目录',
      vikingUri: 'viking://resources/tenants/tenant-alpha/kb-1/node-dir/',
    });
    nodeRepo.find.mockResolvedValue([]);
    ovClientService.request.mockResolvedValue({});

    await service.remove('node-dir', 'tenant-alpha', { user: 'admin' });

    expect(ovClientService.request).toHaveBeenCalledWith(
      {
        baseUrl: 'https://ov.example.com',
        apiKey: 'ov-sk-test',
        account: 'tenant-alpha',
        user: 'admin',
      },
      '/api/v1/fs?uri=viking%3A%2F%2Fresources%2Ftenants%2Ftenant-alpha%2Fkb-1%2Fnode-dir%2F&recursive=true',
      'DELETE',
      undefined,
      { user: 'admin' },
      { serviceLabel: 'OpenViking 资源删除' },
    );
  });

  it('remove 遇到 OpenViking 404 时应继续清理本地元数据', async () => {
    nodeRepo.findOne.mockResolvedValue({
      id: 'node-missing',
      tenantId: 'tenant-alpha',
      kbId: 'kb-1',
      parentId: null,
      name: '缺失.md',
      vikingUri: 'viking://resources/tenants/tenant-alpha/kb-1/node-missing.md',
    });
    nodeRepo.find.mockResolvedValue([]);
    ovClientService.request.mockRejectedValue(new HttpException('不存在', 404));

    await service.remove('node-missing', 'tenant-alpha');

    expect(nodeRepo.remove).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'node-missing' }),
    );
  });
});
