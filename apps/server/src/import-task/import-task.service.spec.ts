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

  let service: ImportTaskService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ImportTaskService(
      taskRepo as never,
      kbRepo as never,
      nodeRepo as never,
      settings as never,
      ovClient as never,
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
        sourceUrls: ['https://example.com/repo-a.git', 'https://example.com/repo-b.git'],
      },
      'tenant-a',
    );

    expect(taskRepo.create).toHaveBeenCalledTimes(2);
    expect(taskRepo.save).toHaveBeenCalledWith([
      expect.objectContaining({
        sourceUrl: 'https://example.com/repo-a.git',
        targetUri: 'viking://resources/tenant-a/kb-1/imports/git/',
        tenantId: 'tenant-a',
      }),
      expect.objectContaining({
        sourceUrl: 'https://example.com/repo-b.git',
        targetUri: 'viking://resources/tenant-a/kb-1/imports/git/',
        tenantId: 'tenant-a',
      }),
    ]);
    expect(result).toEqual(
      expect.objectContaining({
        sourceUrl: 'https://example.com/repo-a.git',
      }),
    );
  });

  it('会拒绝当前未打通的本地上传任务', async () => {
    await expect(
      service.create(
        {
          kbId: 'kb-1',
          sourceType: 'local',
          targetUri: 'viking://kb/local',
        },
        'tenant-a',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(taskRepo.create).not.toHaveBeenCalled();
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
        targetUri: 'viking://resources/tenant-a/kb-2/imports/feishu/',
      }),
    );
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
        sourceUrl: 'https://example.com/repo.git',
        targetUri: 'viking://resources/tenant-a/kb-3/node-1/',
      },
      'tenant-a',
    );

    expect(result).toEqual(
      expect.objectContaining({
        targetUri: 'viking://resources/tenant-a/kb-3/node-1/',
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
          sourceUrl: 'https://example.com/repo.git',
          targetUri: 'viking://resources/tenant-b/kb-x/node-y/',
        },
        'tenant-a',
      ),
    ).rejects.toThrow('非法导入目标路径');
    expect(taskRepo.create).not.toHaveBeenCalled();
  });
});
