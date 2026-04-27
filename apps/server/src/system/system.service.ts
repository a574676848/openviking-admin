import { Injectable, Inject } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';
import { OVClientService } from '../common/ov-client.service';
import { IMPORT_TASK_REPOSITORY } from '../import-task/domain/repositories/import-task.repository.interface';
import type { IImportTaskRepository } from '../import-task/domain/repositories/import-task.repository.interface';
import { KNOWLEDGE_BASE_REPOSITORY } from '../knowledge-base/domain/repositories/knowledge-base.repository.interface';
import type { IKnowledgeBaseRepository } from '../knowledge-base/domain/repositories/knowledge-base.repository.interface';
import { SEARCH_LOG_REPOSITORY } from '../search/domain/repositories/search-log.repository.interface';
import type { ISearchLogRepository } from '../search/domain/repositories/search-log.repository.interface';
import { TENANT_REPOSITORY } from '../tenant/domain/repositories/tenant.repository.interface';
import type { ITenantRepository } from '../tenant/domain/repositories/tenant.repository.interface';

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

/** 解析 OV 文本表格为结构化行数据 */
function parseOVTable(tableStr: string): Array<Record<string, string>> {
  const lines = tableStr.split('\n').filter(l => l.trim() && !l.trim().startsWith('+'));
  if (lines.length < 2) return [];
  const headers = lines[0].split('|').map(h => h.trim()).filter(Boolean);
  return lines.slice(1).map(line => {
    const cells = line.split('|').map(c => c.trim()).filter(Boolean);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = cells[i] ?? ''; });
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
const ACTIVE_TENANT_STATUS = 'active';
const OV_QUEUE_PATH = '/api/v1/observer/queue';
const OV_VIKINGDB_PATH = '/api/v1/observer/vikingdb';
const OV_HEALTH_PATH = '/health';

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
    @Inject(TENANT_REPOSITORY)
    private readonly tenantRepo: ITenantRepository,
  ) {}

  async getDashboardStats(tenantId: string | null) {
    const where = tenantId ? { tenantId } : {};
    const ovTargetsResult = await this.resolveDashboardOVTargets(tenantId);
    const ovTargets = ovTargetsResult.targets;

    const [
      kbCount,
      taskCount,
      searchCount,
      zeroCount,
      recentTasks,
      ovSnapshot,
    ] = await Promise.allSettled([
      this.kbRepo.count({ where }),
      this.taskRepo.count(where),
      this.logRepo.count({ where }),
      this.logRepo.count({ where: { ...where, resultCount: 0 } }),
      this.taskRepo.find(
        where,
        { createdAt: 'DESC' },
        DASHBOARD_RECENT_TASK_LIMIT,
      ),
      this.resolveOVSnapshot(ovTargets),
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
      tenantCount: ovTargetsResult.tenantCount,
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

    const tenants = (await this.tenantRepo.findAll()).filter(
      (tenant) => tenant.status === ACTIVE_TENANT_STATUS,
    );
    if (tenants.length === 0) {
      return {
        targets: [
          {
            id: 'default',
            connection: await this.resolveOVConnection(null),
          },
        ],
        tenantCount: tenants.length,
      };
    }

    return {
      targets: await Promise.all(
        tenants.map(async (tenant) => ({
          id: tenant.id,
          connection: await this.resolveOVConnection(tenant.id),
        })),
      ),
      tenantCount: tenants.length,
    };
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
                  const val = queue.value as Record<string, unknown> | undefined;
                  const result = val?.result as Record<string, unknown> | undefined;
                  const tableStr = (result?.status ?? val?.result ?? val) as string | undefined;
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
