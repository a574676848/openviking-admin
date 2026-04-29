import { Injectable, Inject, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { SettingsService } from '../settings/settings.service';
import { OVClientService } from '../common/ov-client.service';
import { IMPORT_TASK_REPOSITORY } from '../import-task/domain/repositories/import-task.repository.interface';
import type { IImportTaskRepository } from '../import-task/domain/repositories/import-task.repository.interface';
import { KNOWLEDGE_BASE_REPOSITORY } from '../knowledge-base/domain/repositories/knowledge-base.repository.interface';
import type { IKnowledgeBaseRepository } from '../knowledge-base/domain/repositories/knowledge-base.repository.interface';
import {
  KnowledgeBase,
  KNOWLEDGE_BASE_TABLE,
} from '../knowledge-base/entities/knowledge-base.entity';
import { SEARCH_LOG_REPOSITORY } from '../search/domain/repositories/search-log.repository.interface';
import type { ISearchLogRepository } from '../search/domain/repositories/search-log.repository.interface';
import { SEARCH_LOG_TABLE } from '../search/entities/search-log.entity';
import { TENANT_REPOSITORY } from '../tenant/domain/repositories/tenant.repository.interface';
import type { ITenantRepository } from '../tenant/domain/repositories/tenant.repository.interface';
import type { TenantModel } from '../tenant/domain/tenant.model';
import { DynamicDataSourceService } from '../common/dynamic-datasource.service';
import {
  TenantIsolationLevel,
  TenantStatus,
} from '../common/constants/system.enum';
import {
  DashboardImportTaskStatsService,
  type PlatformImportTaskStats,
} from './dashboard-import-task-stats.service';

interface DashboardOVConnection {
  baseUrl: string;
  apiKey: string;
  account: string;
}

interface DashboardOVTarget {
  id: string;
  connection: DashboardOVConnection;
}

interface DashboardOVTargetsResult {
  targets: DashboardOVTarget[];
  tenantCount?: number;
}

export interface TenantLeaderboardItem {
  tenantId: string;
  tenantName: string;
  value: number;
}

interface PlatformKnowledgeBaseStats {
  total: number;
  topTenants: TenantLeaderboardItem[];
}

/** 解析 OV 文本表格为结构化行数据 */
function parseOVTable(tableStr: string): Array<Record<string, string>> {
  const lines = tableStr
    .split('\n')
    .filter((l) => l.trim() && !l.trim().startsWith('+'));
  if (lines.length < 2) return [];
  const headers = lines[0]
    .split('|')
    .map((h) => h.trim())
    .filter(Boolean);
  return lines.slice(1).map((line) => {
    const cells = line
      .split('|')
      .map((c) => c.trim())
      .filter(Boolean);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = cells[i] ?? '';
    });
    return row;
  });
}

/** 从队列表格中提取各队列 Pending 数值 */
function parseQueueTable(tableStr: string): Record<string, number> {
  const rows = parseOVTable(tableStr);
  const queue: Record<string, number> = {};
  for (const row of rows) {
    const name = row['Queue']?.trim();
    const pending = parseInt(row['Pending'] || '0', 10);
    if (name && name !== 'TOTAL' && !isNaN(pending)) {
      queue[name] = pending;
    }
  }
  return queue;
}

const DEFAULT_OV_BASE_URL = 'http://localhost:8080';
const DEFAULT_OV_ACCOUNT = 'default';
const DASHBOARD_RECENT_TASK_LIMIT = 8;
const DASHBOARD_LEADERBOARD_LIMIT = 5;
const TENANT_SCHEMA_PREFIX = 'tenant_';
const EMPTY_VALUE = '';
const OV_QUEUE_PATH = '/api/v1/observer/queue';
const OV_VIKINGDB_PATH = '/api/v1/observer/vikingdb';
const OV_HEALTH_PATH = '/health';

@Injectable()
export class SystemService {
  private readonly logger = new Logger(SystemService.name);

  constructor(
    private readonly defaultDataSource: DataSource,
    private readonly settings: SettingsService,
    private readonly ovClient: OVClientService,
    private readonly dynamicDS: DynamicDataSourceService,
    @Inject(IMPORT_TASK_REPOSITORY)
    private readonly taskRepo: IImportTaskRepository,
    @Inject(KNOWLEDGE_BASE_REPOSITORY)
    private readonly kbRepo: IKnowledgeBaseRepository,
    @Inject(SEARCH_LOG_REPOSITORY)
    private readonly logRepo: ISearchLogRepository,
    @Inject(TENANT_REPOSITORY)
    private readonly tenantRepo: ITenantRepository,
    private readonly dashboardImportTaskStats: DashboardImportTaskStatsService,
  ) {}

  async getDashboardStats(tenantId: string | null) {
    const where = tenantId ? { tenantId } : {};
    const activeTenants = tenantId ? [] : await this.listActiveTenants();
    const ovTargetsResult = await this.resolveDashboardOVTargets(
      tenantId,
      activeTenants,
    );
    const ovTargets = ovTargetsResult.targets;

    const [
      scopedKbCount,
      tenantTaskCount,
      searchCount,
      zeroCount,
      tenantRecentTasks,
      ovSnapshot,
    ] = await Promise.allSettled([
      tenantId ? this.kbRepo.count({ where }) : Promise.resolve(0),
      tenantId ? this.taskRepo.count(where) : Promise.resolve(0),
      this.logRepo.count({ where }),
      this.logRepo.count({ where: { ...where, resultCount: 0 } }),
      tenantId
        ? this.taskRepo.find(
            where,
            { createdAt: 'DESC' },
            DASHBOARD_RECENT_TASK_LIMIT,
          )
        : Promise.resolve([]),
      this.resolveOVSnapshot(ovTargets),
    ]);

    let failedTasks = 0;
    let runningTasks = 0;
    if (tenantId) {
      [failedTasks, runningTasks] = await Promise.all([
        this.taskRepo.count({
          ...where,
          status: 'failed',
        }),
        this.taskRepo.count({
          ...where,
          status: 'running',
        }),
      ]);
    }

    let quota: Record<string, unknown> | null = null;
    let tenantIdentifier: string | null = null;
    let platformKnowledgeBaseStats: PlatformKnowledgeBaseStats | null = null;
    let platformImportTaskStats: PlatformImportTaskStats | null = null;
    let tenantSearchTop: TenantLeaderboardItem[] = [];
    if (tenantId) {
      const tenant =
        (await this.tenantRepo.findById(tenantId)) ??
        (await this.tenantRepo.findByTenantId(tenantId));
      if (tenant) {
        quota = tenant.quota;
        tenantIdentifier = tenant.tenantId;
      }
    } else {
      [platformKnowledgeBaseStats, tenantSearchTop, platformImportTaskStats] =
        await Promise.all([
          this.resolvePlatformKnowledgeBaseStats(activeTenants),
          this.resolveTenantSearchTop(activeTenants),
          this.dashboardImportTaskStats.resolvePlatformStats(activeTenants),
        ]);
    }

    const effectiveKbCount = tenantId
      ? scopedKbCount.status === 'fulfilled'
        ? scopedKbCount.value
        : 0
      : (platformKnowledgeBaseStats?.total ?? 0);
    const effectiveSearchCount =
      searchCount.status === 'fulfilled' ? searchCount.value : 0;
    const effectiveZeroCount =
      zeroCount.status === 'fulfilled' ? zeroCount.value : 0;

    return {
      kbCount: effectiveKbCount,
      taskCount: tenantId
        ? tenantTaskCount.status === 'fulfilled'
          ? tenantTaskCount.value
          : 0
        : (platformImportTaskStats?.total ?? 0),
      searchCount: effectiveSearchCount,
      zeroCount: effectiveZeroCount,
      failedTasks: tenantId
        ? failedTasks
        : (platformImportTaskStats?.failed ?? 0),
      runningTasks: tenantId
        ? runningTasks
        : (platformImportTaskStats?.running ?? 0),
      recentTasks: tenantId
        ? tenantRecentTasks.status === 'fulfilled'
          ? tenantRecentTasks.value
          : []
        : (platformImportTaskStats?.recentTasks ?? []),
      quota,
      tenantIdentifier,
      tenantCount: ovTargetsResult.tenantCount,
      platformKbCount: platformKnowledgeBaseStats?.total,
      tenantSearchTop,
      tenantKnowledgeBaseTop: platformKnowledgeBaseStats?.topTenants ?? [],
      health:
        ovSnapshot.status === 'fulfilled'
          ? ovSnapshot.value.health
          : {
              ok: false,
              message: `引擎健康检查异常: ${ovSnapshot.reason instanceof Error ? ovSnapshot.reason.message : '未知错误'}`,
            },
      queue: ovSnapshot.status === 'fulfilled' ? ovSnapshot.value.queue : null,
    };
  }

  private async resolveDashboardOVTargets(
    tenantId: string | null,
    activeTenants: TenantModel[],
  ): Promise<DashboardOVTargetsResult> {
    if (tenantId) {
      return {
        targets: [
          {
            id: tenantId,
            connection: await this.resolveOVConnection(tenantId),
          },
        ],
      };
    }

    if (activeTenants.length === 0) {
      return {
        targets: [
          {
            id: 'default',
            connection: await this.resolveOVConnection(null),
          },
        ],
        tenantCount: activeTenants.length,
      };
    }

    return {
      targets: await Promise.all(
        activeTenants.map(async (tenant) => ({
          id: tenant.id,
          connection: await this.resolveOVConnection(tenant.id),
        })),
      ),
      tenantCount: activeTenants.length,
    };
  }

  private async listActiveTenants(): Promise<TenantModel[]> {
    return (await this.tenantRepo.findAll()).filter(
      (tenant) => tenant.status === TenantStatus.ACTIVE,
    );
  }

  private async resolveOVConnection(
    tenantId: string | null,
  ): Promise<DashboardOVConnection> {
    const config = await this.settings.resolveOVConfig(tenantId);
    return {
      baseUrl: config.baseUrl || DEFAULT_OV_BASE_URL,
      apiKey: config.apiKey || '',
      account: config.account || DEFAULT_OV_ACCOUNT,
    };
  }

  private async resolveOVSnapshot(targets: DashboardOVTarget[]) {
    const uniqueTargets = this.uniqueOVTargets(targets);
    const results = await Promise.allSettled(
      uniqueTargets.map(async (target) => {
        const [health, queue, vikingdb] = await Promise.allSettled([
          this.ovClient.getHealth(target.connection.baseUrl),
          this.ovClient.request(target.connection, OV_QUEUE_PATH),
          this.ovClient.request(target.connection, OV_VIKINGDB_PATH),
        ]);

        return {
          healthOk: health.status === 'fulfilled' && !!health.value,
          baseUrl: target.connection.baseUrl,
          version:
            health.status === 'fulfilled' && health.value
              ? ((health.value as Record<string, unknown>).version as string)
              : null,
          queue:
            queue.status === 'fulfilled'
              ? (() => {
                  const val = queue.value as
                    | Record<string, unknown>
                    | undefined;
                  const result = val?.result as
                    | Record<string, unknown>
                    | undefined;
                  const tableStr = (result?.status ?? val?.result ?? val) as
                    | string
                    | undefined;
                  return tableStr ? parseQueueTable(tableStr) : null;
                })()
              : null,
          vikingdb:
            vikingdb.status === 'fulfilled'
              ? ((vikingdb.value as Record<string, unknown>)?.result ?? null)
              : null,
        };
      }),
    );

    const snapshots = results
      .filter((item) => item.status === 'fulfilled')
      .map((item) => item.value);
    const healthyCount = snapshots.filter((item) => item.healthOk).length;
    const total = uniqueTargets.length;

    return {
      health: {
        ok: total > 0 && healthyCount === total,
        message:
          total === 1
            ? this.buildSingleHealthMessage(snapshots[0])
            : `OpenViking 配置 ${healthyCount}/${total} 可用`,
      },
      queue: this.mergeQueues(snapshots.map((item) => item.queue)),
    };
  }

  private async resolvePlatformKnowledgeBaseStats(
    tenants: TenantModel[],
  ): Promise<PlatformKnowledgeBaseStats> {
    const counts = await Promise.all(
      tenants.map(async (tenant) => ({
        tenantId: tenant.tenantId,
        tenantName: tenant.displayName || tenant.tenantId,
        value: await this.safeCountKnowledgeBasesForTenant(tenant),
      })),
    );
    const sorted = counts.sort((left, right) => right.value - left.value);

    return {
      total: sorted.reduce((sum, item) => sum + item.value, 0),
      topTenants: sorted.slice(0, DASHBOARD_LEADERBOARD_LIMIT),
    };
  }

  private async safeCountKnowledgeBasesForTenant(
    tenant: TenantModel,
  ): Promise<number> {
    try {
      return await this.countKnowledgeBasesForTenant(tenant);
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      this.logger.warn(
        `统计租户知识库失败，已按 0 处理: ${tenant.tenantId} (${message})`,
      );
      return 0;
    }
  }

  private async countKnowledgeBasesForTenant(
    tenant: TenantModel,
  ): Promise<number> {
    switch (tenant.isolationLevel) {
      case TenantIsolationLevel.MEDIUM:
        return this.countKnowledgeBasesInSchema(tenant.tenantId);
      case TenantIsolationLevel.LARGE:
        return this.countKnowledgeBasesInDedicatedDatabase(tenant);
      case TenantIsolationLevel.SMALL:
      default:
        return this.defaultDataSource.getRepository(KnowledgeBase).count({
          where: { tenantId: tenant.tenantId },
        });
    }
  }

  private async countKnowledgeBasesInSchema(tenantId: string): Promise<number> {
    const queryRunner = this.defaultDataSource.createQueryRunner();
    await queryRunner.connect();
    try {
      await queryRunner.query(
        `SET search_path TO "${this.buildTenantSchemaName(tenantId)}", public`,
      );
      const result = await queryRunner.query(
        `SELECT COUNT(*)::int AS count FROM "${KNOWLEDGE_BASE_TABLE}"`,
      );
      return Number(result?.[0]?.count ?? 0);
    } finally {
      await queryRunner.release();
    }
  }

  private async countKnowledgeBasesInDedicatedDatabase(
    tenant: TenantModel,
  ): Promise<number> {
    if (!tenant.dbConfig) {
      this.logger.warn(
        `LARGE 租户缺少独立库配置，无法统计知识库: ${tenant.tenantId}`,
      );
      return 0;
    }
    const tenantDataSource = await this.dynamicDS.getTenantDataSource(
      tenant.tenantId,
      tenant.dbConfig,
    );
    return tenantDataSource.getRepository(KnowledgeBase).count();
  }

  private async resolveTenantSearchTop(
    tenants: TenantModel[],
  ): Promise<TenantLeaderboardItem[]> {
    const tenantNameMap = new Map(
      tenants.map((tenant) => [
        tenant.tenantId,
        tenant.displayName || tenant.tenantId,
      ]),
    );
    const rows = await this.defaultDataSource
      .createQueryBuilder()
      .from(SEARCH_LOG_TABLE, 'l')
      .select('l.tenant_id', 'tenantId')
      .addSelect('COUNT(*)', 'count')
      .where('l.tenant_id IS NOT NULL')
      .andWhere('l.tenant_id != :empty', { empty: EMPTY_VALUE })
      .groupBy('l.tenant_id')
      .orderBy('count', 'DESC')
      .limit(Math.max(DASHBOARD_LEADERBOARD_LIMIT * 4, 20))
      .getRawMany<{ tenantId: string; count: string }>();

    return rows
      .map((row) => ({
        tenantId: row.tenantId,
        tenantName: tenantNameMap.get(row.tenantId) ?? row.tenantId,
        value: Number(row.count ?? 0),
      }))
      .filter((item) => tenantNameMap.has(item.tenantId))
      .slice(0, DASHBOARD_LEADERBOARD_LIMIT);
  }

  private buildTenantSchemaName(tenantId: string) {
    return `${TENANT_SCHEMA_PREFIX}${tenantId.replace(/-/g, '_')}`;
  }

  private uniqueOVTargets(targets: DashboardOVTarget[]) {
    const seen = new Set<string>();
    return targets.filter((target) => {
      const key = [
        target.connection.baseUrl,
        target.connection.account,
        target.connection.apiKey,
      ].join('|');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private buildSingleHealthMessage(snapshot?: {
    healthOk: boolean;
    baseUrl: string;
  }) {
    if (snapshot?.healthOk) return '核心引擎状态正常';
    const baseUrl = snapshot?.baseUrl ?? DEFAULT_OV_BASE_URL;
    return `引擎连接失败: ${baseUrl}${OV_HEALTH_PATH} 不可达`;
  }

  private mergeQueues(queues: Array<Record<string, number> | null>) {
    const merged: Record<string, number> = {};
    for (const queue of queues) {
      if (!queue) continue;
      for (const [key, value] of Object.entries(queue)) {
        merged[key] = (merged[key] ?? 0) + value;
      }
    }
    return Object.keys(merged).length > 0 ? merged : null;
  }
}
