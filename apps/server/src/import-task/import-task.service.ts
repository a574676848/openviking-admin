import { Injectable, Logger, NotFoundException, Inject } from '@nestjs/common';
import { CreateImportTaskDto } from './dto/create-import-task.dto';
import { SettingsService } from '../settings/settings.service';
import { OVClientService } from '../common/ov-client.service';
import { TaskStatus } from '../common/constants/system.enum';
import { IMPORT_TASK_REPOSITORY } from './domain/repositories/import-task.repository.interface';
import type { IImportTaskRepository } from './domain/repositories/import-task.repository.interface';

@Injectable()
export class ImportTaskService {
  private readonly logger = new Logger(ImportTaskService.name);

  constructor(
    @Inject(IMPORT_TASK_REPOSITORY)
    private readonly taskRepo: IImportTaskRepository,
    private readonly settings: SettingsService,
    private readonly ovClient: OVClientService,
  ) {}

  getStatusLabel(status: string) {
    const labels: Record<string, string> = {
      [TaskStatus.PENDING]: '等待处理',
      [TaskStatus.RUNNING]: '正在解析并向量化',
      [TaskStatus.DONE]: '向量化成功',
      [TaskStatus.FAILED]: '处理异常',
    };
    return labels[status] || status;
  }

  findAll(tenantId: string | null) {
    return this.taskRepo.findAll(tenantId);
  }

  async findOne(id: string, tenantId: string | null) {
    const task = await this.taskRepo.findById(id, tenantId);
    if (!task) throw new NotFoundException(`任务不存在`);
    return task;
  }

  /** 支持批量任务创建 */
  async create(dto: CreateImportTaskDto, tenantId: string) {
    const urls = dto.sourceUrls || (dto.sourceUrl ? [dto.sourceUrl] : []);

    const tasks = urls.map((url) => {
      return this.taskRepo.create({
        kbId: dto.kbId,
        sourceType: dto.sourceType as any,
        sourceUrl: url,
        targetUri: dto.targetUri,
        integrationId: dto.integrationId,
        tenantId,
        status: TaskStatus.PENDING,
      });
    });

    const saved = await this.taskRepo.save(tasks);
    this.logger.log(
      `Provisioned ${saved.length} import tasks for tenant ${tenantId}`,
    );
    return saved;
  }

  async syncResult(id: string, tenantId: string | null) {
    const task = await this.findOne(id, tenantId);
    if (task.status !== TaskStatus.DONE) return task;

    const rawConn = await this.settings.resolveOVConfig(tenantId);
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
      const nodeCount = statData?.result?.children_count ?? 0;

      const vecData = await this.ovClient.request(
        conn,
        `/api/v1/debug/vector/count?uri=${encodeURIComponent(task.targetUri)}`,
      );
      const vectorCount = vecData?.result?.count ?? 0;

      await this.taskRepo.update(id, { nodeCount, vectorCount });
      return this.taskRepo.findById(id, tenantId);
    } catch (err) {
      this.logger.warn(`Sync result for task ${id} failed: ${err.message}`);
    }
    return task;
  }
}
