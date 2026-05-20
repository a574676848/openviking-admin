import { KnowledgeBaseController } from './knowledge-base.controller';

describe('KnowledgeBaseController', () => {
  const auditActor = {
    id: 'user-1',
    username: 'admin',
  };

  const kbService = {
    create: jest.fn(),
    remove: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
  };
  const knowledgeTreeService = {
    findByKb: jest.fn(),
  };
  const knowledgeNodeAclService = {
    filterReadableNodes: jest.fn((items) => items),
    assertCanReadNode: jest.fn(),
  };
  const auditService = {
    log: jest.fn(),
  };

  const controller = new KnowledgeBaseController(
    kbService as never,
    knowledgeNodeAclService as never,
    knowledgeTreeService as never,
    auditService as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('findAll 应过滤掉当前用户无 ACL 可见节点的知识库', async () => {
    kbService.findAll.mockResolvedValue([
      { id: 'kb-visible', name: '公开库' },
      { id: 'kb-hidden', name: '受限库' },
    ]);
    knowledgeTreeService.findByKb.mockImplementation(async (kbId: string) =>
      kbId === 'kb-visible'
        ? [{ id: 'node-1', acl: null }]
        : [{ id: 'node-2', acl: { isPublic: false } }],
    );
    knowledgeNodeAclService.filterReadableNodes.mockImplementation(
      (items: Array<{ acl: { isPublic?: boolean } | null }>) =>
        items.filter((item) => !item.acl || item.acl.isPublic),
    );

    const result = await controller.findAll({
      tenantScope: 'mem',
      user: { id: 'user-1', role: 'tenant_viewer' },
    } as never);

    expect(result).toEqual([{ id: 'kb-visible', name: '公开库' }]);
  });

  it('审计写入失败时应补偿删除已创建的知识库', async () => {
    kbService.create.mockResolvedValue({
      id: 'kb-1',
      name: '记忆',
    });
    auditService.log.mockRejectedValue(new Error('audit failed'));

    const request = {
      tenantScope: 'mem',
      user: {
        id: 'user-1',
        username: 'admin',
      },
      headers: {},
      ip: '127.0.0.1',
    };

    await expect(
      controller.create(
        {
          name: '记忆',
          description: '',
          tenantId: 'mem',
          vikingUri: 'viking://resources/mem/',
        },
        request as never,
      ),
    ).rejects.toThrow('audit failed');

    expect(kbService.create).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'mem' }),
      auditActor,
    );
    expect(kbService.remove).toHaveBeenCalledWith('kb-1', 'mem', {
      user: 'admin',
    });
  });
});
