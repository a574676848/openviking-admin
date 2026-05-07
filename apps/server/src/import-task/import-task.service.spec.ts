import { BadRequestException, ConflictException } from '@nestjs/common';
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
  };
  const nodeRepo = {
    find: jest.fn(),
  };
  const ovClient = {
    request: jest.fn(),
  };
  const localImportStorage = {
    saveFiles: jest.fn(),
    deleteBySourceUrl: jest.fn(),
    isManagedFileUrl: jest.fn(),
  };

  let service: ImportTaskService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ImportTaskService(
      taskRepo as never,
      kbRepo as never,
      nodeRepo as never,
      settings as never,
      ovClient as never,
      localImportStorage as never,
    );
  });

  it('允许将失败任务重新排队', async () => {
    taskRepo.findById
      .mockResolvedValueOnce({
        id: 'task-1',
        status: TaskStatus.FAILED,
      })
      .mockResolvedValueOnce({
        id: 'task-1',
        status: TaskStatus.PENDING,
        errorMsg: null,
      });

    const result = await service.retry('task-1', 'tenant-a');

    expect(taskRepo.update).toHaveBeenCalledWith(
      'task-1',
      expect.objectContaining({
        status: TaskStatus.PENDING,
        errorMsg: null,
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        id: 'task-1',
        status: TaskStatus.PENDING,
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
      status: TaskStatus.FAILED,
      sourceType: 'url',
      sourceUrl: 'https://example.com/broken.pdf',
    });

    const result = await service.deleteFailed('task-failed-delete', 'tenant-a');

    expect(taskRepo.delete).toHaveBeenCalledWith('task-failed-delete', 'tenant-a');
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
      status: TaskStatus.FAILED,
      sourceType: 'local',
      sourceUrl: 'file:///data/openviking/imports/broken.md',
    });

    await service.deleteFailed('task-local-failed', 'tenant-a');

    expect(localImportStorage.deleteBySourceUrl).toHaveBeenCalledWith(
      'file:///data/openviking/imports/broken.md',
    );
    expect(taskRepo.delete).toHaveBeenCalledWith('task-local-failed', 'tenant-a');
  });

  it('拒绝物理删除非失败任务', async () => {
    taskRepo.findById.mockResolvedValueOnce({
      id: 'task-done',
      status: TaskStatus.DONE,
      sourceType: 'url',
      sourceUrl: 'https://example.com/done.pdf',
    });

    await expect(
      service.deleteFailed('task-done', 'tenant-a'),
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
    expect(taskRepo.save).toHaveBeenCalledWith([
      expect.objectContaining({
        sourceUrl: 'https://example.com/repo-a.git',
        targetUri: 'viking://resources/tenants/tenant-a/kb-1/imports/git/',
        tenantId: 'tenant-a',
      }),
      expect.objectContaining({
        sourceUrl: 'https://example.com/repo-b.git',
        targetUri: 'viking://resources/tenants/tenant-a/kb-1/imports/git/',
        tenantId: 'tenant-a',
      }),
    ]);
    expect(result).toEqual(
      expect.objectContaining({
        sourceUrl: 'https://example.com/repo-a.git',
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

  it('会将网页提取任务写入 url 目标路径', async () => {
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
        targetUri: 'viking://resources/tenants/tenant-a/kb-url/imports/url/',
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        sourceType: 'url',
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
      },
    ]);

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
        targetUri: 'viking://resources/tenants/tenant-a/kb-url/node-1/',
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
        targetUri: 'viking://resources/tenants/tenant-a/kb-1/imports/local/',
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        sourceUrl: 'file:///data/openviking/imports/manual.md',
      }),
    );
  });

  it('本地导入必须上传文件', async () => {
    await expect(
      service.createLocalUpload({ kbId: 'kb-1' }, [], 'tenant-a'),
    ).rejects.toThrow('请先上传文件');
    expect(localImportStorage.saveFiles).not.toHaveBeenCalled();
  });

  it('未显式传入 targetUri 时会按知识库自动派生企业文档目标路径', async () => {
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
        targetUri: 'viking://resources/tenants/tenant-a/kb-2/imports/feishu/',
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
        targetUri: 'viking://resources/tenants/tenant-a/kb-3/node-1/',
      }),
    );
  });

  it('显式 targetUri 指向文件节点时不应追加目录斜杠', async () => {
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
        targetUri: 'viking://resources/tenants/tenant-a/kb-3/node-file.md',
      }),
    );
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
