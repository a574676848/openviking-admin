import { Injectable, Inject } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';
import { OVClientService } from '../common/ov-client.service';
import { IMPORT_TASK_REPOSITORY } from '../import-task/domain/repositories/import-task.repository.interface';
import type { IImportTaskRepository } from '../import-task/domain/repositories/import-task.repository.interface';
import { KNOWLEDGE_BASE_REPOSITORY } from '../knowledge-base/domain/repositories/knowledge-base.repository.interface';
import type { IKnowledgeBaseRepository } from '../knowledge-base/domain/repositories/knowledge-base.repository.interface';
import { SEARCH_LOG_REPOSITORY } from '../search/domain/repositories/search-log.repository.interface';
import type { ISearchLogRepository } from '../search/domain/repositories/search-log.repository.interface';

@Injectable()
export class SystemService {
  constructor(
    private readonly settings: SettingsService,
    private readonly ovClient: OVClientService,
    @Inject(IMPORT_TASK_REPOSITORY)
    private readonly taskRepo: IImportTaskRepository,
    @Inject(KNOWLEDGE_BASE_REPOSITORY)
    private readonly kbRepo: IKnowledgeBaseRepository,
    @Inject(SEARCH_LOG_REPOSITORY)
    private readonly logRepo: ISearchLogRepository,
  ) {}

  async getDashboardStats(tenantId: string | null) {
    const config = await this.settings.resolveOVConfig(tenantId || '');
    const conn = {
      baseUrl: config.baseUrl || 'http://localhost:8080',
      apiKey: config.apiKey || '',
      account: config.account || '',
    };

    const where = tenantId ? { tenantId } : {};

    const [
      kbCount,
      taskCount,
      searchCount,
      zeroCount,
      recentTasks,
      healthResult,
      queueResult,
    ] = await Promise.allSettled([
      this.kbRepo.count({ where }),
      this.taskRepo.count(where),
      this.logRepo.count({ where }),
      this.logRepo.count({ where: { ...where, resultCount: 0 } }),
      this.taskRepo.find(where, { createdAt: 'DESC' }, 8),
      this.ovClient.getHealth(conn.baseUrl),
      this.ovClient.request(conn, '/api/v1/observer/queue'),
    ]);

    const failedTasks = await this.taskRepo.count({
      ...where,
      status: 'failed',
    });
    const runningTasks = await this.taskRepo.count({
      ...where,
      status: 'running',
    });

    return {
      kbCount: kbCount.status === 'fulfilled' ? kbCount.value : 0,
      taskCount: taskCount.status === 'fulfilled' ? taskCount.value : 0,
      searchCount: searchCount.status === 'fulfilled' ? searchCount.value : 0,
      zeroCount: zeroCount.status === 'fulfilled' ? zeroCount.value : 0,
      failedTasks,
      runningTasks,
      recentTasks: recentTasks.status === 'fulfilled' ? recentTasks.value : [],
      health:
        healthResult.status === 'fulfilled'
          ? { ok: !!healthResult.value, data: healthResult.value }
          : { ok: false },
      queue:
        queueResult.status === 'fulfilled'
          ? (queueResult.value?.result ?? queueResult.value)
          : null,
    };
  }
}
