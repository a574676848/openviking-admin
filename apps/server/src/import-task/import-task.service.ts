import {
  ConflictException,
  Injectable,
  NotFoundException,
  Inject,
  Logger,
} from '@nestjs/common';
import type { ImportTaskModel } from './domain/import-task.model';
import { CreateImportTaskDto } from './dto/create-import-task.dto';
import { SettingsService } from '../settings/settings.service';
import { OVClientService } from '../common/ov-client.service';
import { IMPORT_TASK_REPOSITORY } from './domain/repositories/import-task.repository.interface';
import type { IImportTaskRepository } from './domain/repositories/import-task.repository.interface';
import { TaskStatus } from '../common/constants/system.enum';

@Injectable()
export class ImportTaskService {
  private readonly logger = new Logger(ImportTaskService.name);

  constructor(
    @Inject(IMPORT_TASK_REPOSITORY)
    private readonly taskRepo: IImportTaskRepository,
    private readonly settings: SettingsService,
    private readonly ovClient: OVClientService,
  ) {}

  findAll(tenantId: string | null) {
    return this.taskRepo.findAll(tenantId);
  }

  async findOne(id: string, tenantId: string | null) {
    const task = await this.taskRepo.findById(id, tenantId);
    if (!task) throw new NotFoundException(`导入任务 ${id} 不存在`);
    return task;
  }

  async create(dto: CreateImportTaskDto, tenantId: string) {
    const dispatch = this.taskRepo.create({
      ...dto,
      tenantId,
      status: TaskStatus.PENDING,
    } as Partial<ImportTaskModel>);
    const saved = await this.taskRepo.save(dispatch);
    return Array.isArray(saved) ? saved[0] : saved;
  }

  async syncResult(id: string, tenantId: string | null) {
    const task = await this.findOne(id, tenantId);
    if (!task) return null;

    const rawConn = await this.settings.resolveOVConfig(task.tenantId);
    const conn = {
      baseUrl: rawConn.baseUrl || '',
      apiKey: rawConn.apiKey || '',
      account: rawConn.account || 'default',
      rerankEndpoint: rawConn.rerankEndpoint || '',
      rerankModel: rawConn.rerankModel || '',
    };
    try {
      const statData = await this.ovClient.request(
        conn,
        `/api/v1/fs/stat?uri=${encodeURIComponent(task.targetUri)}`,
      );
      const statResult = statData?.result as
        | Record<string, unknown>
        | undefined;
      const nodeCount = (statResult?.children_count as number) ?? 0;

      const vecData = await this.ovClient.request(
        conn,
        `/api/v1/debug/vector/count?uri=${encodeURIComponent(task.targetUri)}`,
      );
      const vecResult = vecData?.result as Record<string, unknown> | undefined;
      const vectorCount = (vecResult?.count as number) ?? 0;

      await this.taskRepo.update(id, { nodeCount, vectorCount });
      return this.taskRepo.findById(id, tenantId);
    } catch (err) {
      const message = err instanceof Error ? err.message : '未知错误';
      this.logger.warn(`Sync result for task ${id} failed: ${message}`);
    }
  }

  async retry(id: string, tenantId: string | null) {
    const task = await this.findOne(id, tenantId);
    if (![TaskStatus.FAILED, TaskStatus.CANCELLED].includes(task.status as TaskStatus)) {
      throw new ConflictException('只有失败或已取消的任务才能重试');
    }

    await this.taskRepo.update(id, {
      status: TaskStatus.PENDING,
      errorMsg: null,
      updatedAt: new Date(),
    });
    return this.taskRepo.findById(id, tenantId);
  }

  async cancel(id: string, tenantId: string | null) {
    const task = await this.findOne(id, tenantId);
    if (task.status === TaskStatus.RUNNING) {
      throw new ConflictException('任务已进入执行阶段，当前版本不支持中途停止');
    }
    if (task.status !== TaskStatus.PENDING) {
      throw new ConflictException('只有排队中的任务才能取消');
    }

    await this.taskRepo.update(id, {
      status: TaskStatus.CANCELLED,
      errorMsg: '用户已取消排队任务',
      updatedAt: new Date(),
    });
    return this.taskRepo.findById(id, tenantId);
  }
}
