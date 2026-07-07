import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { TaskStatus } from '../common/constants/system.enum';
import { ImportTaskService } from './import-task.service';

describe('ImportTaskService', () => {
  const taskRepo = {
    findAll: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    findOne: jest.fn(),
    count: jest.fn(),
    find: jest.fn(),
  };
  const settings = {
    resolveOVConfig: jest.fn(),
  };
  const kbRepo = {
    findById: jest.fn(),
    save: jest.fn(),
  };
  const nodeRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    createWithGeneratedUri: jest.fn(),
    createFileWithGeneratedUri: jest.fn(),
    remove: jest.fn(),
  };
  const ovClient = {
    request: jest.fn(),
  };
  const localImportStorage = {
    saveFiles: jest.fn(),
    deleteBySourceUrl: jest.fn(),
    isManagedFileUrl: jest.fn(),
  };
  const knowledgeTreeService = {
    create: jest.fn(),
    remove: jest.fn(),
  };
  const knowledgeNodeAclService = {
    getAllowedUris: jest.fn(),
    canReadNode: jest.fn(),
    filterReadableNodes: jest.fn(),
    assertCanReadNode: jest.fn(),
  };
  const queryRunner = {
    isTransactionActive: false,
    isReleased: false,
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
  };
  const defaultDataSource = {
    createQueryRunner: jest.fn(() => queryRunner),
  };
  const request = {
    tenantQueryRunner: queryRunner,
    tenantDataSource: undefined,
  };

  let service: ImportTaskService;

  beforeEach(() => {
    jest.clearAllMocks();
    queryRunner.isTransactionActive = false;
    queryRunner.isReleased = false;
    request.tenantQueryRunner = queryRunner;
    request.tenantDataSource = undefined;
    kbRepo.findById.mockResolvedValue(null);
    kbRepo.save.mockImplementation(async (kb) => kb);
    nodeRepo.find.mockResolvedValue([]);
    nodeRepo.findOne.mockResolvedValue(null);
    nodeRepo.save.mockImplementation(async (payload) => payload);
    nodeRepo.createWithGeneratedUri.mockImplementation(async (payload) => ({
      id: `node-${payload.name}`,
      tenantId: payload.tenantId,
      kbId: payload.kbId,
      parentId: payload.parentId ?? null,
      name: payload.name,
      kind: payload.kind ?? 'collection',
      vikingUri: `viking://resources/tenants/${payload.tenantId}/${payload.kbId}/nodes/${payload.name}/`,
      contentUri: null,
      sortOrder: payload.sortOrder ?? 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    nodeRepo.createFileWithGeneratedUri.mockImplementation(async (payload) => ({
      id: `node-${payload.name}`,
      tenantId: payload.tenantId,
      kbId: payload.kbId,
      parentId: payload.parentId ?? null,
      name: payload.name,
      kind: 'document',
      vikingUri: `viking://resources/tenants/${payload.tenantId}/${payload.kbId}/nodes/${payload.name}/`,
      contentUri: null,
      indexStatus: payload.indexStatus ?? 'pending',
      sortOrder: payload.sortOrder ?? 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    nodeRepo.remove.mockImplementation(async (node) => node);
    knowledgeTreeService.create.mockImplementation(async (payload) =>
      nodeRepo.createWithGeneratedUri(payload),
    );
    knowledgeTreeService.remove.mockResolvedValue(undefined);
    knowledgeNodeAclService.getAllowedUris.mockResolvedValue([
      'viking://resources/tenants/tenant-a/kb-1/nodes/visible/',
    ]);
    knowledgeNodeAclService.canReadNode.mockImplementation(
      (node, principal) => {
        const acl = node?.acl;
        if (!acl || acl.isPublic) {
          return true;
        }

        return Boolean(
          (principal.role && acl.roles?.includes(principal.role)) ||
          acl.users?.includes(principal.userId),
        );
      },
    );
    knowledgeNodeAclService.filterReadableNodes.mockImplementation(
      (nodes, principal) =>
        nodes.filter(
          (node: {
            acl?: {
              isPublic?: boolean;
              roles?: string[];
              users?: string[];
            } | null;
          }) => knowledgeNodeAclService.canReadNode(node, principal),
        ),
    );
    knowledgeNodeAclService.assertCanReadNode.mockImplementation(
      (node, principal, message) => {
        if (!knowledgeNodeAclService.canReadNode(node, principal)) {
          throw new ForbiddenException(message ?? 'forbidden');
        }
      },
    );
    service = new ImportTaskService(
      taskRepo,
      kbRepo as never,
      nodeRepo as never,
      settings as never,
      ovClient as never,
      localImportStorage as never,
      knowledgeTreeService as never,
      knowledgeNodeAclService as never,
      defaultDataSource as never,
      request as never,
    );
  });

  it('按 ACL 查询任务列表时应过滤不可见任务', async () => {
    taskRepo.findAll.mockResolvedValue([
      {
        id: 'task-visible',
        kbId: 'kb-1',
        tenantId: 'tenant-a',
        targetUri:
          'viking://resources/tenants/tenant-a/kb-1/nodes/visible/doc.md',
      },
      {
        id: 'task-hidden',
        kbId: 'kb-1',
        tenantId: 'tenant-a',
        targetUri:
          'viking://resources/tenants/tenant-a/kb-1/nodes/hidden/doc.md',
      },
    ]);

    const result = await service.findAll('tenant-a', {
      userId: 'user-1',
      role: 'tenant_viewer',
    });

    expect(result).toEqual([expect.objectContaining({ id: 'task-visible' })]);
  });

  it('按 ACL 查询单个任务时应拒绝不可见任务', async () => {
    taskRepo.findById.mockResolvedValue({
      id: 'task-hidden',
      kbId: 'kb-1',
      tenantId: 'tenant-a',
      targetUri: 'viking://resources/tenants/tenant-a/kb-1/nodes/hidden/doc.md',
    });

    await expect(
      service.findOne('task-hidden', 'tenant-a', {
        userId: 'user-1',
        role: 'tenant_viewer',
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('按 ACL 创建导入任务时应拒绝不可见目标节点', async () => {
    kbRepo.findById.mockResolvedValue({
      id: 'kb-1',
      tenantId: 'tenant-a',
      vikingUri: 'viking://resources/tenants/tenant-a/kb-1/',
    });
    nodeRepo.find.mockResolvedValue([
      {
        id: 'node-hidden',
        kbId: 'kb-1',
        tenantId: 'tenant-a',
        acl: { isPublic: false, users: ['other-user'], roles: [] },
        vikingUri: 'viking://resources/tenants/tenant-a/kb-1/nodes/hidden/',
        sortOrder: 0,
        createdAt: new Date(),
      },
    ]);
    nodeRepo.findOne.mockResolvedValue({
      id: 'node-hidden',
      kbId: 'kb-1',
      tenantId: 'tenant-a',
      acl: { isPublic: false, users: ['other-user'], roles: [] },
      vikingUri: 'viking://resources/tenants/tenant-a/kb-1/nodes/hidden/',
      sortOrder: 0,
      createdAt: new Date(),
    });

    await expect(
      service.create(
        {
          kbId: 'kb-1',
          sourceType: 'url',
          sourceUrl: 'https://example.com/a.md',
          targetUri: 'viking://resources/tenants/tenant-a/kb-1/nodes/hidden/',
        },
        'tenant-a',
        undefined,
        { userId: 'user-1', role: 'tenant_viewer' },
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('允许将失败任务重新排队', async () => {
    taskRepo.findById
      .mockResolvedValueOnce({
        id: 'task-1',
        tenantId: 'tenant-a',
        status: TaskStatus.FAILED,
        targetUri: 'viking://resources/tenants/tenant-a/kb-1/imports/git/',
      })
      .mockResolvedValueOnce({
        id: 'task-1',
        status: TaskStatus.PENDING,
        errorMsg: null,
      });
    settings.resolveOVConfig.mockResolvedValue({
      baseUrl: 'http://ov.local',
      apiKey: 'ov-key',
      account: 'tenant-a',
      user: 'worker-user',
    });
    ovClient.request.mockResolvedValueOnce({ status: 'ok' });

    const result = await service.retry('task-1', 'tenant-a');

    expect(ovClient.request).toHaveBeenCalledWith(
      expect.objectContaining({ account: 'tenant-a' }),
      '/api/v1/fs?uri=viking%3A%2F%2Fresources%2Ftenants%2Ftenant-a%2Fkb-1%2Fimports%2Fgit%2F&recursive=true',
      'DELETE',
      undefined,
      { user: 'worker-user' },
      { serviceLabel: 'OpenViking 重试资源清理' },
    );
    expect(taskRepo.update).toHaveBeenCalledWith(
      'task-1',
      expect.objectContaining({
        status: TaskStatus.PENDING,
        errorMsg: null,
        nodeCount: 0,
        vectorCount: 0,
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        id: 'task-1',
        status: TaskStatus.PENDING,
      }),
    );
  });

  it('重试时目标资源已不存在仍允许重新排队', async () => {
    taskRepo.findById
      .mockResolvedValueOnce({
        id: 'task-missing-target',
        tenantId: 'tenant-a',
        status: TaskStatus.FAILED,
        targetUri: 'viking://resources/tenants/tenant-a/kb-1/imports/git/',
      })
      .mockResolvedValueOnce({
        id: 'task-missing-target',
        status: TaskStatus.PENDING,
        errorMsg: null,
      });
    settings.resolveOVConfig.mockResolvedValue({
      baseUrl: 'http://ov.local',
      apiKey: 'ov-key',
      account: 'tenant-a',
      user: 'worker-user',
    });
    ovClient.request.mockRejectedValueOnce(new Error('NOT_FOUND'));

    await service.retry('task-missing-target', 'tenant-a');

    expect(taskRepo.update).toHaveBeenCalledWith(
      'task-missing-target',
      expect.objectContaining({
        status: TaskStatus.PENDING,
        errorMsg: null,
        nodeCount: 0,
        vectorCount: 0,
      }),
    );
  });

  it('重试前发现 OV 侧已有向量时应同步为完成，不重新导入', async () => {
    taskRepo.findById
      .mockResolvedValueOnce({
        id: 'task-ov-done',
        tenantId: 'tenant-a',
        kbId: 'kb-1',
        status: TaskStatus.FAILED,
        targetUri: 'viking://resources/tenants/tenant-a/kb-1/imports/git/',
      })
      .mockResolvedValueOnce({
        id: 'task-ov-done',
        status: TaskStatus.DONE,
        nodeCount: 7,
        vectorCount: 9,
      });
    settings.resolveOVConfig.mockResolvedValue({
      baseUrl: 'http://ov.local',
      apiKey: 'ov-key',
      account: 'tenant-a',
      user: 'worker-user',
    });
    ovClient.request
      .mockResolvedValueOnce({
        result: { children_count: 3, descendant_count: 4 },
      })
      .mockResolvedValueOnce({ result: { count: 9 } });

    const result = await service.retry('task-ov-done', 'tenant-a');

    expect(taskRepo.update).toHaveBeenCalledWith(
      'task-ov-done',
      expect.objectContaining({
        status: TaskStatus.DONE,
        errorMsg: null,
        nodeCount: 7,
        vectorCount: 9,
      }),
    );
    expect(ovClient.request).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining('/api/v1/fs?'),
      'DELETE',
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
    expect(result).toEqual(
      expect.objectContaining({
        id: 'task-ov-done',
        status: TaskStatus.DONE,
      }),
    );
  });

  it('重试前发现 OV 侧已有资源但未产出向量时应同步为运行中', async () => {
    taskRepo.findById
      .mockResolvedValueOnce({
        id: 'task-ov-running',
        tenantId: 'tenant-a',
        kbId: 'kb-1',
        status: TaskStatus.FAILED,
        targetUri: 'viking://resources/tenant-a/kb-1/imports/git/',
      })
      .mockResolvedValueOnce({
        id: 'task-ov-running',
        status: TaskStatus.RUNNING,
        nodeCount: 2,
        vectorCount: 0,
      });
    settings.resolveOVConfig.mockResolvedValue({
      baseUrl: 'http://ov.local',
      apiKey: 'ov-key',
      account: 'tenant-a',
      user: 'worker-user',
    });
    ovClient.request
      .mockResolvedValueOnce({
        result: { children_count: 2, descendant_count: 0 },
      })
      .mockResolvedValueOnce({ result: { count: 0 } });

    const result = await service.retry('task-ov-running', 'tenant-a');

    expect(taskRepo.update).toHaveBeenCalledWith(
      'task-ov-running',
      expect.objectContaining({
        status: TaskStatus.RUNNING,
        errorMsg: null,
        nodeCount: 2,
        vectorCount: 0,
      }),
    );
    expect(ovClient.request).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining('/api/v1/fs?'),
      'DELETE',
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
    expect(result).toEqual(
      expect.objectContaining({
        id: 'task-ov-running',
        status: TaskStatus.RUNNING,
      }),
    );
  });

  it('重试已取消任务时不清理目标资源', async () => {
    taskRepo.findById
      .mockResolvedValueOnce({
        id: 'task-cancelled',
        tenantId: 'tenant-a',
        status: TaskStatus.CANCELLED,
        targetUri: 'viking://resources/tenants/tenant-a/kb-1/imports/git/',
      })
      .mockResolvedValueOnce({
        id: 'task-cancelled',
        status: TaskStatus.PENDING,
        errorMsg: null,
      });

    await service.retry('task-cancelled', 'tenant-a');

    expect(ovClient.request).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining('/api/v1/fs?'),
      'DELETE',
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
    expect(taskRepo.update).toHaveBeenCalledWith(
      'task-cancelled',
      expect.objectContaining({
        status: TaskStatus.PENDING,
        errorMsg: null,
        nodeCount: 0,
        vectorCount: 0,
      }),
    );
  });

  it('允许取消排队中的任务', async () => {
    taskRepo.findById
      .mockResolvedValueOnce({
        id: 'task-2',
        status: TaskStatus.PENDING,
      })
      .mockResolvedValueOnce({
        id: 'task-2',
        status: TaskStatus.CANCELLED,
        errorMsg: '用户已取消排队任务',
      });

    const result = await service.cancel('task-2', 'tenant-a');

    expect(taskRepo.update).toHaveBeenCalledWith(
      'task-2',
      expect.objectContaining({
        status: TaskStatus.CANCELLED,
        errorMsg: '用户已取消排队任务',
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        id: 'task-2',
        status: TaskStatus.CANCELLED,
      }),
    );
  });

  it('拒绝取消执行中的任务', async () => {
    taskRepo.findById.mockResolvedValueOnce({
      id: 'task-3',
      status: TaskStatus.RUNNING,
    });

    await expect(service.cancel('task-3', 'tenant-a')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(taskRepo.update).not.toHaveBeenCalled();
  });

  it('允许物理删除失败任务', async () => {
    taskRepo.findById.mockResolvedValueOnce({
      id: 'task-failed-delete',
      tenantId: 'tenant-a',
      kbId: 'kb-1',
      status: TaskStatus.FAILED,
      sourceType: 'url',
      sourceUrl: 'https://example.com/broken.pdf',
      autoCreatedNodeId: null,
    });

    const result = await service.deleteFailed('task-failed-delete', 'tenant-a');

    expect(knowledgeTreeService.remove).not.toHaveBeenCalled();
    expect(taskRepo.delete).toHaveBeenCalledWith(
      'task-failed-delete',
      'tenant-a',
    );
    expect(result).toEqual(
      expect.objectContaining({
        id: 'task-failed-delete',
        status: TaskStatus.FAILED,
      }),
    );
  });

  it('物理删除失败的本地任务时会清理受控上传文件', async () => {
    taskRepo.findById.mockResolvedValueOnce({
      id: 'task-local-failed',
      tenantId: 'tenant-a',
      kbId: 'kb-1',
      status: TaskStatus.FAILED,
      sourceType: 'local',
      sourceUrl: 'file:///data/openviking/imports/broken.md',
      autoCreatedNodeId: null,
    });

    await service.deleteFailed('task-local-failed', 'tenant-a');

    expect(localImportStorage.deleteBySourceUrl).toHaveBeenCalledWith(
      'file:///data/openviking/imports/broken.md',
    );
    expect(taskRepo.delete).toHaveBeenCalledWith(
      'task-local-failed',
      'tenant-a',
    );
  });

  it('物理删除失败任务时会同步删除自动创建的文档节点', async () => {
    const autoNode = {
      id: 'node-auto',
      tenantId: 'tenant-a',
      kbId: 'kb-1',
      kind: 'document',
      vikingUri: 'viking://resources/tenants/tenant-a/kb-1/nodes/node-auto/',
    };
    taskRepo.findById.mockResolvedValueOnce({
      id: 'task-auto-node-failed',
      tenantId: 'tenant-a',
      kbId: 'kb-1',
      status: TaskStatus.FAILED,
      sourceType: 'url',
      sourceUrl: 'https://example.com/broken.pdf',
      autoCreatedNodeId: 'node-auto',
    });
    nodeRepo.findOne.mockResolvedValueOnce(autoNode);

    await service.deleteFailed('task-auto-node-failed', 'tenant-a');

    expect(nodeRepo.findOne).toHaveBeenCalledWith({
      where: {
        id: 'node-auto',
        tenantId: 'tenant-a',
        kbId: 'kb-1',
      },
    });
    expect(knowledgeTreeService.remove).toHaveBeenCalledWith(
      'node-auto',
      'tenant-a',
    );
    expect(taskRepo.delete).toHaveBeenCalledWith(
      'task-auto-node-failed',
      'tenant-a',
    );
  });

  it('物理删除失败的 Git 任务时会清理目标 OpenViking 资源', async () => {
    taskRepo.findById.mockResolvedValueOnce({
      id: 'task-git-failed',
      tenantId: 'tenant-a',
      kbId: 'kb-1',
      status: TaskStatus.FAILED,
      sourceType: 'git',
      sourceUrl: 'https://example.com/repo.git',
      targetUri: 'viking://resources/tenants/tenant-a/kb-1/imports/git/',
      autoCreatedNodeId: null,
    });
    settings.resolveOVConfig.mockResolvedValue({
      baseUrl: 'http://ov.local',
      apiKey: 'ov-key',
      account: 'tenant-a',
      user: 'worker-user',
    });
    ovClient.request.mockResolvedValueOnce({ status: 'ok' });

    await service.deleteFailed('task-git-failed', 'tenant-a');

    expect(ovClient.request).toHaveBeenCalledWith(
      expect.objectContaining({ account: 'tenant-a' }),
      '/api/v1/fs?uri=viking%3A%2F%2Fresources%2Ftenants%2Ftenant-a%2Fkb-1%2Fimports%2Fgit%2F&recursive=true',
      'DELETE',
      undefined,
      { user: 'worker-user' },
      { serviceLabel: 'OpenViking 任务资源删除' },
    );
    expect(taskRepo.delete).toHaveBeenCalledWith('task-git-failed', 'tenant-a');
  });

  it('物理删除失败的 Git 任务时目标资源不存在也会删除任务记录', async () => {
    taskRepo.findById.mockResolvedValueOnce({
      id: 'task-git-missing-target',
      tenantId: 'tenant-a',
      kbId: 'kb-1',
      status: TaskStatus.FAILED,
      sourceType: 'git',
      sourceUrl: 'https://example.com/repo.git',
      targetUri: 'viking://resources/tenants/tenant-a/kb-1/imports/git/',
      autoCreatedNodeId: null,
    });
    settings.resolveOVConfig.mockResolvedValue({
      baseUrl: 'http://ov.local',
      apiKey: 'ov-key',
      account: 'tenant-a',
      user: 'worker-user',
    });
    ovClient.request.mockRejectedValueOnce(new Error('NOT_FOUND'));

    await service.deleteFailed('task-git-missing-target', 'tenant-a');

    expect(taskRepo.delete).toHaveBeenCalledWith(
      'task-git-missing-target',
      'tenant-a',
    );
  });

  it('物理删除自动文档节点失败时应回滚且保留任务', async () => {
    taskRepo.findById.mockResolvedValueOnce({
      id: 'task-auto-node-delete-failed',
      tenantId: 'tenant-a',
      kbId: 'kb-1',
      status: TaskStatus.FAILED,
      sourceType: 'url',
      sourceUrl: 'https://example.com/broken.pdf',
      autoCreatedNodeId: 'node-auto',
    });
    nodeRepo.findOne.mockResolvedValueOnce({
      id: 'node-auto',
      tenantId: 'tenant-a',
      kbId: 'kb-1',
      kind: 'document',
    });
    knowledgeTreeService.remove.mockRejectedValueOnce(new Error('OV 删除失败'));

    await expect(
      service.deleteFailed('task-auto-node-delete-failed', 'tenant-a'),
    ).rejects.toThrow('OV 删除失败');

    expect(queryRunner.startTransaction).toHaveBeenCalled();
    expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
    expect(taskRepo.delete).not.toHaveBeenCalled();
  });

  it('允许物理删除成功的 Git 任务并清理目标 OpenViking 资源', async () => {
    taskRepo.findById.mockResolvedValueOnce({
      id: 'task-done',
      tenantId: 'tenant-a',
      kbId: 'kb-1',
      status: TaskStatus.DONE,
      sourceType: 'git',
      sourceUrl: 'https://example.com/repo.git',
      targetUri:
        'viking://resources/tenants/tenant-a/kb-1/imports/git/repo-a-12345678/',
      autoCreatedNodeId: null,
    });
    settings.resolveOVConfig.mockResolvedValue({
      baseUrl: 'http://ov.local',
      apiKey: 'ov-key',
      account: 'tenant-a',
      user: 'worker-user',
    });
    ovClient.request.mockResolvedValueOnce({ status: 'ok' });

    await service.deleteFailed('task-done', 'tenant-a');

    expect(ovClient.request).toHaveBeenCalledWith(
      expect.objectContaining({ account: 'tenant-a' }),
      '/api/v1/fs?uri=viking%3A%2F%2Fresources%2Ftenants%2Ftenant-a%2Fkb-1%2Fimports%2Fgit%2Frepo-a-12345678%2F&recursive=true',
      'DELETE',
      undefined,
      { user: 'worker-user' },
      { serviceLabel: 'OpenViking 任务资源删除' },
    );
    expect(taskRepo.delete).toHaveBeenCalledWith('task-done', 'tenant-a');
  });

  it('拒绝物理删除未完成任务', async () => {
    taskRepo.findById.mockResolvedValueOnce({
      id: 'task-running',
      status: TaskStatus.RUNNING,
      sourceType: 'url',
      sourceUrl: 'https://example.com/running.pdf',
    });

    await expect(
      service.deleteFailed('task-running', 'tenant-a'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(taskRepo.delete).not.toHaveBeenCalled();
  });

  it('会将批量 sourceUrls 展开成多条真实任务', async () => {
    taskRepo.create.mockImplementation((payload) => payload);
    taskRepo.save.mockImplementation(async (payload) => payload);
    kbRepo.findById.mockResolvedValue({
      id: 'kb-1',
      vikingUri: 'viking://resources/tenant-a/kb-1/',
    });
    nodeRepo.find.mockResolvedValue([]);

    const result = await service.create(
      {
        kbId: 'kb-1',
        sourceType: 'git',
        integrationId: 'integration-1',
        sourceUrls: [
          'https://example.com/repo-a.git',
          'https://example.com/repo-b.git',
        ],
      },
      'tenant-a',
    );

    expect(taskRepo.create).toHaveBeenCalledTimes(2);
    const savedTasks = taskRepo.save.mock.calls[0][0];
    expect(savedTasks).toEqual([
      expect.objectContaining({
        sourceUrl: 'https://example.com/repo-a.git',
        sourceName: 'repo-a',
        targetUri: 'viking://resources/tenants/tenant-a/kb-1/nodes/repo-a/',
        autoCreatedNodeId: 'node-repo-a',
        tenantId: 'tenant-a',
      }),
      expect.objectContaining({
        sourceUrl: 'https://example.com/repo-b.git',
        sourceName: 'repo-b',
        targetUri: 'viking://resources/tenants/tenant-a/kb-1/nodes/repo-b/',
        autoCreatedNodeId: 'node-repo-b',
        tenantId: 'tenant-a',
      }),
    ]);
    expect(savedTasks[0].targetUri).not.toBe(savedTasks[1].targetUri);
    expect(knowledgeTreeService.create).toHaveBeenCalledTimes(2);
    expect(knowledgeTreeService.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        kbId: 'kb-1',
        tenantId: 'tenant-a',
        name: 'repo-a',
        kind: 'collection',
      }),
      undefined,
    );
    expect(knowledgeTreeService.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        kbId: 'kb-1',
        tenantId: 'tenant-a',
        name: 'repo-b',
        kind: 'collection',
      }),
      undefined,
    );
    expect(nodeRepo.createFileWithGeneratedUri).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        sourceUrl: 'https://example.com/repo-a.git',
      }),
    );
  });

  it('git 导入到目录节点下时应创建对应 collection 子节点', async () => {
    taskRepo.create.mockImplementation((payload) => payload);
    taskRepo.save.mockImplementation(async (payload) => payload);
    kbRepo.findById.mockResolvedValue({
      id: 'kb-1',
      vikingUri: 'viking://resources/tenant-a/kb-1/',
    });
    nodeRepo.find.mockResolvedValue([
      {
        id: 'parent-node',
        vikingUri: 'viking://resources/tenant-a/kb-1/collections/engineering/',
        kind: 'collection',
      },
    ]);
    nodeRepo.findOne.mockResolvedValueOnce({
      id: 'parent-node',
      tenantId: 'tenant-a',
      kbId: 'kb-1',
      kind: 'collection',
      vikingUri:
        'viking://resources/tenants/tenant-a/kb-1/collections/engineering/',
    });

    await service.create(
      {
        kbId: 'kb-1',
        sourceType: 'git',
        integrationId: 'integration-1',
        sourceUrl: 'https://example.com/repo-a.git',
        targetUri:
          'viking://resources/tenants/tenant-a/kb-1/collections/engineering/',
      },
      'tenant-a',
    );

    expect(knowledgeTreeService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        kbId: 'kb-1',
        tenantId: 'tenant-a',
        parentId: 'parent-node',
        name: 'repo-a',
        kind: 'collection',
      }),
      undefined,
    );
    expect(taskRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        targetUri: 'viking://resources/tenants/tenant-a/kb-1/nodes/repo-a/',
        autoCreatedNodeId: 'node-repo-a',
      }),
    );
  });

  it('Git 导入缺少集成凭证时应拒绝创建', async () => {
    await expect(
      service.create(
        {
          kbId: 'kb-git',
          sourceType: 'git',
          sourceUrl: 'https://git.exexm.com/repo.git',
        },
        'tenant-a',
      ),
    ).rejects.toThrow('该来源类型必须选择集成凭证');
    expect(taskRepo.create).not.toHaveBeenCalled();
  });

  it('会将网页提取任务挂到自动创建的文档节点', async () => {
    taskRepo.create.mockImplementation((payload) => payload);
    taskRepo.save.mockImplementation(async (payload) => payload);
    kbRepo.findById.mockResolvedValue({
      id: 'kb-url',
      vikingUri: 'viking://resources/tenant-a/kb-url/',
    });
    nodeRepo.find.mockResolvedValue([]);

    const result = await service.create(
      {
        kbId: 'kb-url',
        sourceType: 'url',
        sourceUrl: 'https://docs.example.com/page',
      },
      'tenant-a',
    );

    expect(taskRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceType: 'url',
        sourceUrl: 'https://docs.example.com/page',
        sourceName: 'page',
        targetUri: 'viking://resources/tenants/tenant-a/kb-url/nodes/page.md/',
        autoCreatedNodeId: 'node-page.md',
      }),
    );
    expect(nodeRepo.createFileWithGeneratedUri).toHaveBeenCalledWith(
      expect.objectContaining({
        kbId: 'kb-url',
        tenantId: 'tenant-a',
        parentId: null,
        name: 'page.md',
        kind: 'document',
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        sourceType: 'url',
      }),
    );
  });

  it('创建自动文档节点后保存任务失败时应回滚事务', async () => {
    taskRepo.create.mockImplementation((payload) => payload);
    taskRepo.save.mockRejectedValueOnce(new Error('任务保存失败'));
    kbRepo.findById.mockResolvedValue({
      id: 'kb-url',
      vikingUri: 'viking://resources/tenant-a/kb-url/',
    });

    await expect(
      service.create(
        {
          kbId: 'kb-url',
          sourceType: 'url',
          sourceUrl: 'https://docs.example.com/page',
        },
        'tenant-a',
      ),
    ).rejects.toThrow('任务保存失败');

    expect(nodeRepo.createFileWithGeneratedUri).toHaveBeenCalled();
    expect(queryRunner.startTransaction).toHaveBeenCalled();
    expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
    expect(queryRunner.commitTransaction).not.toHaveBeenCalled();
  });

  it('创建导入任务时优先使用显式 sourceName', async () => {
    taskRepo.create.mockImplementation((payload) => payload);
    taskRepo.save.mockImplementation(async (payload) => payload);
    kbRepo.findById.mockResolvedValue({
      id: 'kb-url',
      vikingUri: 'viking://resources/tenant-a/kb-url/',
    });
    nodeRepo.find.mockResolvedValue([]);

    await service.create(
      {
        kbId: 'kb-url',
        sourceType: 'url',
        sourceUrl: 'https://docs.example.com/raw/manual.md',
        sourceName: '产品手册.md',
      },
      'tenant-a',
    );

    expect(taskRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceName: '产品手册.md',
      }),
    );
  });

  it('批量创建导入任务时应按 sourceNames 下标写入来源名称', async () => {
    taskRepo.create.mockImplementation((payload) => payload);
    taskRepo.save.mockImplementation(async (payload) => payload);
    kbRepo.findById.mockResolvedValue({
      id: 'kb-url',
      vikingUri: 'viking://resources/tenant-a/kb-url/',
    });
    nodeRepo.find.mockResolvedValue([]);

    await service.create(
      {
        kbId: 'kb-url',
        sourceType: 'url',
        sourceUrls: [
          'https://docs.example.com/a.md',
          'https://docs.example.com/b.md',
        ],
        sourceNames: ['A 文档.md', 'B 文档.md'],
      },
      'tenant-a',
    );

    expect(taskRepo.save).toHaveBeenCalledWith([
      expect.objectContaining({ sourceName: 'A 文档.md' }),
      expect.objectContaining({ sourceName: 'B 文档.md' }),
    ]);
  });

  it('URL 导入未传来源名称时应从路径解析展示名', async () => {
    taskRepo.create.mockImplementation((payload) => payload);
    taskRepo.save.mockImplementation(async (payload) => payload);
    kbRepo.findById.mockResolvedValue({
      id: 'kb-url',
      vikingUri: 'viking://resources/tenant-a/kb-url/',
    });
    nodeRepo.find.mockResolvedValue([]);

    await service.create(
      {
        kbId: 'kb-url',
        sourceType: 'url',
        sourceUrl:
          'https://docs.example.com/files/%E4%BA%A7%E5%93%81.md?download=1',
      },
      'tenant-a',
    );

    expect(taskRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceName: '产品.md',
      }),
    );
  });

  it('已是引擎租户命名空间的 targetUri 不应重复追加 tenants 前缀', async () => {
    taskRepo.create.mockImplementation((payload) => payload);
    taskRepo.save.mockImplementation(async (payload) => payload);
    kbRepo.findById.mockResolvedValue({
      id: 'kb-url',
      vikingUri: 'viking://resources/tenant-a/kb-url/',
    });
    nodeRepo.find.mockResolvedValue([
      {
        id: 'node-1',
        vikingUri: 'viking://resources/tenant-a/kb-url/node-1/',
        kind: 'collection',
      },
    ]);
    nodeRepo.findOne.mockResolvedValueOnce({
      id: 'node-1',
      tenantId: 'tenant-a',
      kbId: 'kb-url',
      kind: 'collection',
      vikingUri: 'viking://resources/tenants/tenant-a/kb-url/node-1/',
    });

    await service.create(
      {
        kbId: 'kb-url',
        sourceType: 'url',
        sourceUrl: 'https://docs.example.com/page',
        targetUri: 'viking://resources/tenants/tenant-a/kb-url/node-1/',
      },
      'tenant-a',
    );

    expect(taskRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        targetUri: 'viking://resources/tenants/tenant-a/kb-url/nodes/page.md/',
        autoCreatedNodeId: 'node-page.md',
      }),
    );
    expect(nodeRepo.createFileWithGeneratedUri).toHaveBeenCalledWith(
      expect.objectContaining({
        parentId: 'node-1',
        name: 'page.md',
      }),
    );
  });

  it('会拒绝非受控路径的本地上传任务', async () => {
    localImportStorage.isManagedFileUrl.mockReturnValue(false);

    await expect(
      service.create(
        {
          kbId: 'kb-1',
          sourceType: 'local',
          sourceUrl: 'file:///tmp/manual.md',
        },
        'tenant-a',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(taskRepo.create).not.toHaveBeenCalled();
  });

  it('会将受控本地上传文件创建为导入任务', async () => {
    taskRepo.create.mockImplementation((payload) => payload);
    taskRepo.save.mockImplementation(async (payload) => payload);
    localImportStorage.saveFiles.mockResolvedValue([
      {
        originalName: '产品手册.md',
        sourceUrl: 'file:///data/openviking/imports/manual.md',
        size: 128,
        mimeType: 'text/markdown',
      },
    ]);
    localImportStorage.isManagedFileUrl.mockReturnValue(true);
    kbRepo.findById.mockResolvedValue({
      id: 'kb-1',
      vikingUri: 'viking://resources/tenant-a/kb-1/',
    });
    nodeRepo.find.mockResolvedValue([]);

    const result = await service.createLocalUpload(
      { kbId: 'kb-1' },
      [
        {
          originalname: '产品手册.md',
          size: 128,
          buffer: Buffer.from('hello'),
          mimetype: 'text/markdown',
        },
      ],
      'tenant-a',
    );

    expect(localImportStorage.saveFiles).toHaveBeenCalledWith(
      'tenant-a',
      'kb-1',
      expect.any(Array),
    );
    expect(taskRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceType: 'local',
        sourceUrl: 'file:///data/openviking/imports/manual.md',
        sourceName: '产品手册.md',
        targetUri:
          'viking://resources/tenants/tenant-a/kb-1/nodes/产品手册.md/',
        autoCreatedNodeId: 'node-产品手册.md',
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        sourceUrl: 'file:///data/openviking/imports/manual.md',
        sourceName: '产品手册.md',
      }),
    );
  });

  it('显式 targetUri 命中文档节点时不应再自动补建根目录文档', async () => {
    taskRepo.create.mockImplementation((payload) => payload);
    taskRepo.save.mockImplementation(async (payload) => payload);
    localImportStorage.saveFiles.mockResolvedValue([
      {
        originalName: '会议纪要.md',
        sourceUrl: 'file:///data/openviking/imports/minutes.md',
        size: 64,
        mimeType: 'text/markdown',
      },
    ]);
    localImportStorage.isManagedFileUrl.mockReturnValue(true);
    kbRepo.findById.mockResolvedValue({
      id: 'kb-1',
      vikingUri: 'viking://resources/tenant-a/kb-1/',
    });
    nodeRepo.find.mockResolvedValue([
      {
        id: 'node-existing-doc',
        tenantId: 'tenant-a',
        kbId: 'kb-1',
        name: '会议纪要.md',
        kind: 'document',
        vikingUri:
          'viking://resources/tenants/tenant-a/kb-1/node-existing-doc/',
      },
    ]);
    nodeRepo.findOne.mockResolvedValue({
      id: 'node-existing-doc',
      tenantId: 'tenant-a',
      kbId: 'kb-1',
      name: '会议纪要.md',
      kind: 'document',
      vikingUri: 'viking://resources/tenants/tenant-a/kb-1/node-existing-doc/',
      contentUri: null,
    });

    const result = await service.createLocalUpload(
      {
        kbId: 'kb-1',
        targetUri:
          'viking://resources/tenants/tenant-a/kb-1/node-existing-doc/',
      },
      [
        {
          originalname: '会议纪要.md',
          size: 64,
          buffer: Buffer.from('# meeting'),
          mimetype: 'text/markdown',
        },
      ],
      'tenant-a',
    );

    expect(nodeRepo.createFileWithGeneratedUri).not.toHaveBeenCalled();
    expect(taskRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceType: 'local',
        sourceUrl: 'file:///data/openviking/imports/minutes.md',
        sourceName: '会议纪要.md',
        targetUri:
          'viking://resources/tenants/tenant-a/kb-1/node-existing-doc/',
        autoCreatedNodeId: null,
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        sourceUrl: 'file:///data/openviking/imports/minutes.md',
        targetUri:
          'viking://resources/tenants/tenant-a/kb-1/node-existing-doc/',
        autoCreatedNodeId: null,
      }),
    );
  });

  it('受控本地 file URL 直接创建任务时应从路径解析来源名称', async () => {
    taskRepo.create.mockImplementation((payload) => payload);
    taskRepo.save.mockImplementation(async (payload) => payload);
    localImportStorage.isManagedFileUrl.mockReturnValue(true);
    kbRepo.findById.mockResolvedValue({
      id: 'kb-1',
      vikingUri: 'viking://resources/tenant-a/kb-1/',
    });
    nodeRepo.find.mockResolvedValue([]);

    await service.create(
      {
        kbId: 'kb-1',
        sourceType: 'local',
        sourceUrl: 'file:///data/openviking/imports/%E4%BA%A7%E5%93%81.md',
      },
      'tenant-a',
    );

    expect(taskRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceName: '产品.md',
      }),
    );
  });

  it('本地导入必须上传文件', async () => {
    await expect(
      service.createLocalUpload({ kbId: 'kb-1' }, [], 'tenant-a'),
    ).rejects.toThrow('请先上传文件');
    expect(localImportStorage.saveFiles).not.toHaveBeenCalled();
  });

  it('未显式传入 targetUri 时会为企业文档自动创建文档节点', async () => {
    taskRepo.create.mockImplementation((payload) => payload);
    taskRepo.save.mockImplementation(async (payload) => payload);
    kbRepo.findById.mockResolvedValue({
      id: 'kb-2',
      vikingUri: 'viking://resources/tenant-a/kb-2/',
    });
    nodeRepo.find.mockResolvedValue([]);

    const result = await service.create(
      {
        kbId: 'kb-2',
        sourceType: 'feishu',
        sourceUrl: 'https://xxx.feishu.cn/docx/abc',
        integrationId: 'integration-1',
      },
      'tenant-a',
    );

    expect(kbRepo.findById).toHaveBeenCalledWith('kb-2', 'tenant-a');
    expect(result).toEqual(
      expect.objectContaining({
        targetUri: 'viking://resources/tenants/tenant-a/kb-2/nodes/abc.md/',
        autoCreatedNodeId: 'node-abc.md',
      }),
    );
    expect(taskRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceName: null,
        targetUri: 'viking://resources/tenants/tenant-a/kb-2/nodes/abc.md/',
        autoCreatedNodeId: 'node-abc.md',
      }),
    );
    expect(nodeRepo.createFileWithGeneratedUri).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'abc.md',
        parentId: null,
      }),
    );
  });

  it('同步导入结果时应透传 OV 用户头', async () => {
    taskRepo.findById.mockResolvedValue({
      id: 'task-sync',
      tenantId: 'tenant-a',
      targetUri: 'viking://resources/tenant-a/kb-1/imports/git/',
    });
    settings.resolveOVConfig.mockResolvedValue({
      baseUrl: 'http://ov.local',
      apiKey: 'ov-key',
      account: 'tenant-a',
      user: 'worker-user',
      rerankEndpoint: null,
      rerankModel: null,
    });
    ovClient.request
      .mockResolvedValueOnce({
        result: { children_count: 3, descendant_count: 4 },
      })
      .mockResolvedValueOnce({ result: { count: '9' } });
    taskRepo.findById.mockResolvedValueOnce({
      id: 'task-sync',
      tenantId: 'tenant-a',
      targetUri: 'viking://resources/tenant-a/kb-1/imports/git/',
    });

    await service.syncResult('task-sync', 'tenant-a');

    expect(ovClient.request).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ account: 'tenant-a' }),
      expect.stringContaining('/api/v1/fs/stat'),
      'GET',
      undefined,
      { user: 'worker-user' },
    );
    expect(ovClient.request).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ account: 'tenant-a' }),
      expect.stringContaining('/api/v1/debug/vector/count'),
      'GET',
      undefined,
      { user: 'worker-user' },
    );
    expect(taskRepo.update).toHaveBeenCalledWith('task-sync', {
      nodeCount: 7,
      vectorCount: 9,
    });
  });

  it('同步导入结果时 stat 无计数字段则回退读取资源树', async () => {
    settings.resolveOVConfig.mockResolvedValue({
      baseUrl: 'http://ov.local',
      apiKey: 'ov-key',
      account: 'tenant-a',
      user: 'worker-user',
      rerankEndpoint: null,
      rerankModel: null,
    });
    ovClient.request
      .mockResolvedValueOnce({ result: { name: 'node-1', isDir: true } })
      .mockResolvedValueOnce({
        result: [
          { uri: 'viking://resources/tenants/tenant-a/kb-1/node-1/a.md' },
          { uri: 'viking://resources/tenants/tenant-a/kb-1/node-1/b.md' },
        ],
      })
      .mockResolvedValueOnce({ result: { count: 19 } });
    taskRepo.findById.mockResolvedValueOnce({
      id: 'task-tree-fallback',
      tenantId: 'tenant-a',
      targetUri: 'viking://resources/tenants/tenant-a/kb-1/node-1/',
    });

    await service.syncResult('task-tree-fallback', 'tenant-a');

    expect(ovClient.request).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ account: 'tenant-a' }),
      expect.stringContaining('/api/v1/fs/tree'),
      'GET',
      undefined,
      { user: 'worker-user' },
    );
    expect(taskRepo.update).toHaveBeenCalledWith('task-tree-fallback', {
      nodeCount: 2,
      vectorCount: 19,
    });
  });

  it('同步导入结果后应按知识库根资源刷新知识库统计', async () => {
    settings.resolveOVConfig.mockResolvedValue({
      baseUrl: 'http://ov.local',
      apiKey: 'ov-key',
      account: 'tenant-a',
      user: 'worker-user',
      rerankEndpoint: null,
      rerankModel: null,
    });
    taskRepo.findById.mockResolvedValueOnce({
      id: 'task-sync-kb',
      tenantId: 'tenant-a',
      kbId: 'kb-1',
      targetUri: 'viking://resources/tenants/tenant-a/kb-1/imports/git/',
    });
    kbRepo.findById.mockResolvedValueOnce({
      id: 'kb-1',
      tenantId: 'tenant-a',
      vikingUri: 'viking://resources/tenant-a/kb-1/',
      docCount: 0,
      vectorCount: 0,
      updatedAt: new Date('2026-04-29T00:00:00.000Z'),
    });
    ovClient.request
      .mockResolvedValueOnce({
        result: { children_count: 3, descendant_count: 4 },
      })
      .mockResolvedValueOnce({ result: { count: 9 } })
      .mockResolvedValueOnce({
        result: { children_count: 40, descendant_count: 6 },
      })
      .mockResolvedValueOnce({ result: { count: 540 } });

    await service.syncResult('task-sync-kb', 'tenant-a');

    expect(taskRepo.update).toHaveBeenCalledWith('task-sync-kb', {
      nodeCount: 7,
      vectorCount: 9,
    });
    expect(kbRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'kb-1',
        docCount: 46,
        vectorCount: 540,
        updatedAt: expect.any(Date),
      }),
    );
  });

  it('同步按钮应补偿回填文档 contentUri 并刷新知识库聚合统计', async () => {
    settings.resolveOVConfig.mockResolvedValue({
      baseUrl: 'http://ov.local',
      apiKey: 'ov-key',
      account: 'tenant-a',
      user: 'worker-user',
      rerankEndpoint: null,
      rerankModel: null,
    });
    taskRepo.findById.mockResolvedValue({
      id: 'task-sync-doc',
      tenantId: 'tenant-a',
      kbId: 'kb-1',
      sourceName: '同步补偿文档.md',
      targetUri: 'viking://resources/tenants/tenant-a/kb-1/node-1/',
    });
    nodeRepo.findOne.mockResolvedValueOnce({
      id: 'node-1',
      tenantId: 'tenant-a',
      kbId: 'kb-1',
      name: '同步补偿文档.md',
      kind: 'document',
      vikingUri: 'viking://resources/tenants/tenant-a/kb-1/node-1/',
      contentUri: null,
      indexStatus: 'pending',
      draftVersion: 0,
      indexedVersion: 0,
      vectorCount: null,
      lastIndexedAt: null,
      indexError: null,
      createdAt: new Date('2026-04-29T00:00:00.000Z'),
      updatedAt: new Date('2026-04-29T00:00:00.000Z'),
    });
    kbRepo.findById.mockResolvedValueOnce({
      id: 'kb-1',
      tenantId: 'tenant-a',
      vikingUri: 'viking://resources/tenant-a/kb-1/',
      docCount: 0,
      vectorCount: 0,
      updatedAt: new Date('2026-04-29T00:00:00.000Z'),
    });
    ovClient.request
      .mockResolvedValueOnce({
        result: { children_count: 3, descendant_count: 4 },
      })
      .mockResolvedValueOnce({ result: { count: 9 } })
      .mockResolvedValueOnce({
        result: [
          {
            uri: 'viking://resources/tenants/tenant-a/kb-1/node-1/同步补偿文档.md',
            isDir: false,
          },
        ],
      })
      .mockResolvedValueOnce({
        result: { children_count: 40, descendant_count: 6 },
      })
      .mockResolvedValueOnce({ result: { count: 540 } });
    nodeRepo.save.mockImplementation(async (payload) => payload);

    await service.syncResult('task-sync-doc', 'tenant-a');

    expect(nodeRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'node-1',
        contentUri:
          'viking://resources/tenants/tenant-a/kb-1/node-1/同步补偿文档.md',
        indexStatus: 'clean',
        vectorCount: 9,
        updatedAt: expect.any(Date),
      }),
    );
    expect(taskRepo.update).toHaveBeenCalledWith('task-sync-doc', {
      nodeCount: 7,
      vectorCount: 9,
    });
    expect(kbRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'kb-1',
        docCount: 46,
        vectorCount: 540,
        updatedAt: expect.any(Date),
      }),
    );
  });

  it('同步按钮应通过自动创建节点 ID 修复空 contentUri', async () => {
    settings.resolveOVConfig.mockResolvedValue({
      baseUrl: 'http://ov.local',
      apiKey: 'ov-key',
      account: 'tenant-a',
      user: 'worker-user',
      rerankEndpoint: null,
      rerankModel: null,
    });
    taskRepo.findById.mockResolvedValue({
      id: 'task-sync-auto-doc',
      tenantId: 'tenant-a',
      kbId: 'kb-1',
      sourceName: '自动创建文档.md',
      targetUri: 'viking://resources/tenants/tenant-a/kb-1/nodes/auto-doc/',
      autoCreatedNodeId: 'node-auto-doc',
    });
    nodeRepo.findOne.mockResolvedValueOnce({
      id: 'node-auto-doc',
      tenantId: 'tenant-a',
      kbId: 'kb-1',
      name: '自动创建文档.md',
      kind: 'document',
      vikingUri: 'viking://resources/tenants/tenant-a/kb-1/nodes/auto-doc/',
      contentUri: null,
      indexStatus: 'pending',
      draftVersion: 0,
      indexedVersion: 0,
      vectorCount: null,
      lastIndexedAt: null,
      indexError: null,
      createdAt: new Date('2026-04-29T00:00:00.000Z'),
      updatedAt: new Date('2026-04-29T00:00:00.000Z'),
    });
    kbRepo.findById.mockResolvedValueOnce({
      id: 'kb-1',
      tenantId: 'tenant-a',
      vikingUri: 'viking://resources/tenant-a/kb-1/',
      docCount: 0,
      vectorCount: 0,
      updatedAt: new Date('2026-04-29T00:00:00.000Z'),
    });
    ovClient.request
      .mockResolvedValueOnce({
        result: { children_count: 0, descendant_count: 1 },
      })
      .mockResolvedValueOnce({ result: { count: 6 } })
      .mockResolvedValueOnce({
        result: [
          {
            uri: 'viking://resources/tenants/tenant-a/kb-1/nodes/auto-doc/自动创建文档.md',
            isDir: false,
          },
        ],
      })
      .mockResolvedValueOnce({
        result: { children_count: 10, descendant_count: 3 },
      })
      .mockResolvedValueOnce({ result: { count: 60 } });

    await service.syncResult('task-sync-auto-doc', 'tenant-a');

    expect(nodeRepo.findOne).toHaveBeenCalledWith({
      where: {
        id: 'node-auto-doc',
        tenantId: 'tenant-a',
        kbId: 'kb-1',
      },
    });
    expect(nodeRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'node-auto-doc',
        contentUri:
          'viking://resources/tenants/tenant-a/kb-1/nodes/auto-doc/自动创建文档.md',
        indexStatus: 'clean',
        vectorCount: 6,
        indexError: null,
      }),
    );
    expect(taskRepo.update).toHaveBeenCalledWith('task-sync-auto-doc', {
      nodeCount: 1,
      vectorCount: 6,
    });
  });

  it('显式 targetUri 指向当前知识库节点时允许创建', async () => {
    taskRepo.create.mockImplementation((payload) => payload);
    taskRepo.save.mockImplementation(async (payload) => payload);
    kbRepo.findById.mockResolvedValue({
      id: 'kb-3',
      vikingUri: 'viking://resources/tenant-a/kb-3/',
    });
    nodeRepo.find.mockResolvedValue([
      {
        id: 'node-1',
        vikingUri: 'viking://resources/tenant-a/kb-3/node-1/',
      },
    ]);
    nodeRepo.findOne.mockResolvedValueOnce({
      id: 'node-1',
      tenantId: 'tenant-a',
      kbId: 'kb-3',
      kind: 'collection',
      vikingUri: 'viking://resources/tenants/tenant-a/kb-3/node-1/',
    });

    const result = await service.create(
      {
        kbId: 'kb-3',
        sourceType: 'git',
        integrationId: 'integration-1',
        sourceUrl: 'https://example.com/repo.git',
        targetUri: 'viking://resources/tenant-a/kb-3/node-1/',
      },
      'tenant-a',
    );

    expect(result).toEqual(
      expect.objectContaining({
        targetUri: 'viking://resources/tenants/tenant-a/kb-3/nodes/repo/',
        autoCreatedNodeId: 'node-repo',
      }),
    );
    expect(knowledgeTreeService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        parentId: 'node-1',
        name: 'repo',
        kind: 'collection',
      }),
      undefined,
    );
  });

  it('Git 显式 targetUri 指向文件节点时仍会生成独立子目录', async () => {
    taskRepo.create.mockImplementation((payload) => payload);
    taskRepo.save.mockImplementation(async (payload) => payload);
    kbRepo.findById.mockResolvedValue({
      id: 'kb-3',
      vikingUri: 'viking://resources/tenant-a/kb-3/',
    });
    nodeRepo.find.mockResolvedValue([
      {
        id: 'node-file',
        vikingUri: 'viking://resources/tenant-a/kb-3/node-file.md',
      },
    ]);
    nodeRepo.findOne.mockResolvedValueOnce({
      id: 'node-file',
      tenantId: 'tenant-a',
      kbId: 'kb-3',
      kind: 'document',
      vikingUri: 'viking://resources/tenants/tenant-a/kb-3/node-file.md',
    });

    const result = await service.create(
      {
        kbId: 'kb-3',
        sourceType: 'git',
        integrationId: 'integration-1',
        sourceUrl: 'https://example.com/repo.git',
        targetUri: 'viking://resources/tenant-a/kb-3/node-file.md',
      },
      'tenant-a',
    );

    expect(result).toEqual(
      expect.objectContaining({
        targetUri: expect.stringMatching(
          /^viking:\/\/resources\/tenants\/tenant-a\/kb-3\/node-file.md\/repo-[a-f0-9]{8}\/$/,
        ),
        autoCreatedNodeId: null,
      }),
    );
    expect(knowledgeTreeService.create).not.toHaveBeenCalled();
  });

  it('显式 targetUri 指向其他租户路径时必须拒绝', async () => {
    kbRepo.findById.mockResolvedValue({
      id: 'kb-4',
      vikingUri: 'viking://resources/tenant-a/kb-4/',
    });
    nodeRepo.find.mockResolvedValue([
      {
        id: 'node-2',
        vikingUri: 'viking://resources/tenant-a/kb-4/node-2/',
      },
    ]);

    await expect(
      service.create(
        {
          kbId: 'kb-4',
          sourceType: 'git',
          integrationId: 'integration-1',
          sourceUrl: 'https://example.com/repo.git',
          targetUri: 'viking://resources/tenant-b/kb-x/node-y/',
        },
        'tenant-a',
      ),
    ).rejects.toThrow('非法导入目标路径');
    expect(taskRepo.create).not.toHaveBeenCalled();
  });
});
