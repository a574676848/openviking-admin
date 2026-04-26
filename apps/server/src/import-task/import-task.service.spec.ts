import { ConflictException } from '@nestjs/common';
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
  const ovClient = {
    request: jest.fn(),
  };

  let service: ImportTaskService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ImportTaskService(
      taskRepo as never,
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
});
