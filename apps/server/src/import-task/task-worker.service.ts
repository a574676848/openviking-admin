import { Injectable, Logger, OnModuleInit, Inject } from '@nestjs/common';
import { In } from 'typeorm';
import { ImportTask } from './entities/import-task.entity';
import { QUEUE_CONFIG } from './constants';
import { SettingsService } from '../settings/settings.service';
import { IntegrationService } from '../tenant/integration.service';
import { OVClientService } from '../common/ov-client.service';
import { FeishuIntegrator } from './strategies/feishu.integrator';
import { DingTalkIntegrator } from './strategies/dingtalk.integrator';
import { GitIntegrator } from './strategies/git.integrator';
import { IMPORT_TASK_REPOSITORY } from './domain/repositories/import-task.repository.interface';
import type { IImportTaskRepository } from './domain/repositories/import-task.repository.interface';

@Injectable()
export class TaskWorkerService implements OnModuleInit {
  private readonly logger = new Logger(TaskWorkerService.name);
  private currentConcurrency = 0;
  private isPolling = false;

  constructor(
    @Inject(IMPORT_TASK_REPOSITORY)
    private readonly taskRepo: IImportTaskRepository,
    private readonly settings: SettingsService,
    private readonly integrationService: IntegrationService,
    private readonly ovClient: OVClientService,
    private readonly feishu: FeishuIntegrator,
    private readonly dingtalk: DingTalkIntegrator,
    private readonly git: GitIntegrator,
  ) {}

  async onModuleInit() {
    this.logger.log('Initializing TaskWorker: Running cleanup...');
    await this.recoverZombieTasks();
    this.startWorker();
  }

  /** 容灾：系统重启时恢复僵尸任务 */
  private async recoverZombieTasks() {
    const zombies = await this.taskRepo.findAll(null);
    const runningZombies = zombies.filter((t) => t.status === 'running');

    if (runningZombies.length > 0) {
      this.logger.warn(
        `Recovered ${runningZombies.length} zombie tasks from previous run.`,
      );
      for (const task of runningZombies) {
        await this.taskRepo.update(task.id, { status: 'pending' });
      }
    }
  }

  private startWorker() {
    setInterval(() => this.poll(), QUEUE_CONFIG.POLLING_INTERVAL_MS);
  }

  private async poll() {
    if (
      this.isPolling ||
      this.currentConcurrency >= QUEUE_CONFIG.GLOBAL_MAX_CONCURRENCY
    )
      return;
    this.isPolling = true;

    try {
      const tasks = await this.taskRepo.findAll(null);
      const pendingTasks = tasks
        .filter((t) => t.status === 'pending')
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .slice(
          0,
          QUEUE_CONFIG.GLOBAL_MAX_CONCURRENCY - this.currentConcurrency,
        );

      for (const task of pendingTasks) {
        if (this.currentConcurrency < QUEUE_CONFIG.GLOBAL_MAX_CONCURRENCY) {
          this.processTask(task);
        }
      }
    } finally {
      this.isPolling = false;
    }
  }

  private async processTask(task: ImportTask) {
    this.currentConcurrency++;
    await this.taskRepo.update(task.id, {
      status: 'running',
      updatedAt: new Date(),
    });

    try {
      this.logger.log(
        `>> [Task:${task.id.slice(0, 8)}] Processing ${task.sourceType} pipe...`,
      );
      const rawConn = await this.settings.resolveOVConfig(task.tenantId);
      const conn = {
        baseUrl: rawConn.baseUrl || '',
        apiKey: rawConn.apiKey || '',
        account: rawConn.account || 'default',
        rerankEndpoint: rawConn.rerankEndpoint || '',
        rerankModel: rawConn.rerankModel || '',
      };

      const injectBody: any = {
        path: task.sourceUrl,
        to: task.targetUri,
        reason: `Queue Task: ${task.id}`,
        wait: true,
      };

      if (task.integrationId) {
        const integration = await this.integrationService.findOne(
          task.integrationId,
          task.tenantId,
        );
        const integrators = [this.feishu, this.dingtalk, this.git];
        const strategy = integrators.find((s) => s.supports(integration.type));

        if (strategy) {
          const resolved = await strategy.resolveConfig(
            integration,
            task.sourceUrl,
          );
          injectBody.path = resolved.path;
          injectBody.config = resolved.config;
        }
      }

      await this.ovClient.request(
        conn,
        '/api/v1/resources',
        'POST',
        injectBody,
      );
      await this.taskRepo.update(task.id, {
        status: 'done',
        updatedAt: new Date(),
      });
      this.logger.log(
        `<< [Task:${task.id.slice(0, 8)}] Successfully ingested.`,
      );
    } catch (err) {
      this.logger.error(
        `!! [Task:${task.id.slice(0, 8)}] Fatal failure: ${err.message}`,
      );
      await this.taskRepo.update(task.id, {
        status: 'failed',
        errorMsg: err.message,
        updatedAt: new Date(),
      });
    } finally {
      this.currentConcurrency--;
    }
  }
}
