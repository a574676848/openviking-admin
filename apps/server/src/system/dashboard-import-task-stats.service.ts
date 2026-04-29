import { Inject, Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { DynamicDataSourceService } from '../common/dynamic-datasource.service';
import { TenantIsolationLevel } from '../common/constants/system.enum';
import type { TenantModel } from '../tenant/domain/tenant.model';
import { ImportTask } from '../import-task/entities/import-task.entity';
import type { ImportTaskModel } from '../import-task/domain/import-task.model';
import { IMPORT_TASK_REPOSITORY } from '../import-task/domain/repositories/import-task.repository.interface';
import type { IImportTaskRepository } from '../import-task/domain/repositories/import-task.repository.interface';

const DASHBOARD_RECENT_TASK_LIMIT = 8;
const TENANT_SCHEMA_PREFIX = 'tenant_';

export interface PlatformImportTaskStats {
  total: number;
  failed: number;
  running: number;
  recentTasks: ImportTaskModel[];
}

@Injectable()
export class DashboardImportTaskStatsService {
  private readonly logger = new Logger(DashboardImportTaskStatsService.name);

  constructor(
    private readonly defaultDataSource: DataSource,
    private readonly dynamicDS: DynamicDataSourceService,
    @Inject(IMPORT_TASK_REPOSITORY)
    private readonly taskRepo: IImportTaskRepository,
  ) {}

  async resolvePlatformStats(
    tenants: TenantModel[],
  ): Promise<PlatformImportTaskStats> {
    if (tenants.length === 0) {
      return this.resolveSharedStats();
    }

    const snapshots = await Promise.all(
      tenants.map((tenant) => this.safeResolveTenantStats(tenant)),
    );
    const recentTasks = snapshots
      .flatMap((item) => item.recentTasks)
      .sort(
        (left, right) =>
          new Date(right.createdAt).getTime() -
          new Date(left.createdAt).getTime(),
      )
      .slice(0, DASHBOARD_RECENT_TASK_LIMIT);

    return {
      total: snapshots.reduce((sum, item) => sum + item.total, 0),
      failed: snapshots.reduce((sum, item) => sum + item.failed, 0),
      running: snapshots.reduce((sum, item) => sum + item.running, 0),
      recentTasks,
    };
  }

  private async resolveSharedStats(): Promise<PlatformImportTaskStats> {
    const [total, failed, running, recentTasks] = await Promise.all([
      this.taskRepo.count({}),
      this.taskRepo.count({ status: 'failed' }),
      this.taskRepo.count({ status: 'running' }),
      this.taskRepo.find(
        {},
        { createdAt: 'DESC' },
        DASHBOARD_RECENT_TASK_LIMIT,
      ),
    ]);
    return { total, failed, running, recentTasks };
  }

  private async safeResolveTenantStats(
    tenant: TenantModel,
  ): Promise<PlatformImportTaskStats> {
    try {
      return await this.resolveTenantStats(tenant);
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      this.logger.warn(
        `统计租户导入任务失败，已按 0 处理: ${tenant.tenantId} (${message})`,
      );
      return { total: 0, failed: 0, running: 0, recentTasks: [] };
    }
  }

  private async resolveTenantStats(
    tenant: TenantModel,
  ): Promise<PlatformImportTaskStats> {
    switch (tenant.isolationLevel) {
      case TenantIsolationLevel.MEDIUM:
        return this.resolveSchemaStats(tenant.tenantId);
      case TenantIsolationLevel.LARGE:
        return this.resolveDedicatedStats(tenant);
      case TenantIsolationLevel.SMALL:
      default:
        return this.resolveRepoStats(
          this.defaultDataSource.getRepository(ImportTask),
          { tenantId: tenant.tenantId },
        );
    }
  }

  private async resolveSchemaStats(
    tenantId: string,
  ): Promise<PlatformImportTaskStats> {
    const queryRunner = this.defaultDataSource.createQueryRunner();
    await queryRunner.connect();
    try {
      await queryRunner.query(
        `SET search_path TO "${this.buildTenantSchemaName(tenantId)}", public`,
      );
      return this.resolveRepoStats(
        queryRunner.manager.getRepository(ImportTask),
        {},
      );
    } finally {
      await queryRunner.release();
    }
  }

  private async resolveDedicatedStats(
    tenant: TenantModel,
  ): Promise<PlatformImportTaskStats> {
    if (!tenant.dbConfig) {
      this.logger.warn(
        `LARGE 租户缺少独立库配置，无法统计导入任务: ${tenant.tenantId}`,
      );
      return { total: 0, failed: 0, running: 0, recentTasks: [] };
    }
    const tenantDataSource = await this.dynamicDS.getTenantDataSource(
      tenant.tenantId,
      tenant.dbConfig,
    );
    return this.resolveRepoStats(
      tenantDataSource.getRepository(ImportTask),
      {},
    );
  }

  private async resolveRepoStats(
    repo: {
      count(options?: { where?: Record<string, unknown> }): Promise<number>;
      find(options?: {
        where?: Record<string, unknown>;
        order?: Record<string, 'ASC' | 'DESC'>;
        take?: number;
      }): Promise<ImportTask[]>;
    },
    where: Record<string, unknown>,
  ): Promise<PlatformImportTaskStats> {
    const [total, failed, running, recentTasks] = await Promise.all([
      repo.count({ where }),
      repo.count({ where: { ...where, status: 'failed' } }),
      repo.count({ where: { ...where, status: 'running' } }),
      repo.find({
        where,
        order: { createdAt: 'DESC' },
        take: DASHBOARD_RECENT_TASK_LIMIT,
      }),
    ]);

    return { total, failed, running, recentTasks };
  }

  private buildTenantSchemaName(tenantId: string) {
    return `${TENANT_SCHEMA_PREFIX}${tenantId.replace(/-/g, '_')}`;
  }
}
