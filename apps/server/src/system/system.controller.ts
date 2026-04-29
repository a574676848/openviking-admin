import {
  Controller,
  Get,
  Post,
  Body,
  Req,
  UseGuards,
  BadGatewayException,
  ForbiddenException,
  Inject,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../common/tenant.guard';
import { SettingsService } from '../settings/settings.service';
import { AuditService } from '../audit/audit.service';
import {
  OVClientService,
  type OVConnection,
} from '../common/ov-client.service';
import { SystemService } from './system.service';
import { DynamicDataSourceService } from '../common/dynamic-datasource.service';
import type { AuthenticatedRequest } from '../common/authenticated-request.interface';
import { TENANT_REPOSITORY } from '../tenant/domain/repositories/tenant.repository.interface';
import type { ITenantRepository } from '../tenant/domain/repositories/tenant.repository.interface';
import type { TenantOvConfig } from '../tenant/domain/tenant.model';

const CUSTOM_OV_CONFIG_FIELDS: Array<keyof TenantOvConfig> = [
  'baseUrl',
  'apiKey',
  'account',
  'user',
  'rerankEndpoint',
  'rerankApiKey',
  'rerankModel',
];

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

/** 从 VikingDB 表格中提取集合统计 */
function parseVikingDBTable(tableStr: string): {
  collections: Array<Record<string, string>>;
  total: Record<string, string>;
} {
  const rows = parseOVTable(tableStr);
  const collections = rows.filter((r) => r['Collection']?.trim() !== 'TOTAL');
  const total = rows.find((r) => r['Collection']?.trim() === 'TOTAL') || {};
  return { collections, total };
}

@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('system')
export class SystemController {
  constructor(
    private readonly settings: SettingsService,
    private readonly ovClient: OVClientService,
    private readonly systemService: SystemService,
    private readonly dynamicDS: DynamicDataSourceService,
    private readonly auditService: AuditService,
    @Inject(TENANT_REPOSITORY)
    private readonly tenantRepo: ITenantRepository,
  ) {}

  private async ensureTenantHasCustomOvConfig(
    tenantScope: string | null,
  ): Promise<void> {
    if (!tenantScope) {
      return;
    }

    const tenant =
      (await this.tenantRepo.findByTenantId(tenantScope)) ??
      (await this.tenantRepo.findById(tenantScope));
    const hasCustomOvConfig = CUSTOM_OV_CONFIG_FIELDS.some((field) => {
      const value = tenant?.ovConfig?.[field];
      return typeof value === 'string'
        ? value.trim().length > 0
        : Boolean(value);
    });

    if (!hasCustomOvConfig) {
      throw new ForbiddenException(
        '当前租户未启用自定义 OpenViking 引擎配置，不能访问系统状态。',
      );
    }
  }

  /** 从配置解析 OV 连接，baseUrl 缺失时直接抛错 */
  private async resolveOVConnection(
    tenantScope: string | null,
  ): Promise<OVConnection> {
    const config = await this.settings.resolveOVConfig(tenantScope);
    if (!config.baseUrl) {
      throw new BadGatewayException(
        'OpenViking 引擎地址未配置，请在系统设置中填写 ov.base_url',
      );
    }
    return {
      baseUrl: config.baseUrl,
      apiKey: config.apiKey || '',
      account: config.account || '',
    };
  }

  @Get('health')
  async health(@Req() req: AuthenticatedRequest) {
    await this.ensureTenantHasCustomOvConfig(req.tenantScope);
    const conn = await this.resolveOVConnection(req.tenantScope);
    const openviking = await this.ovClient.getHealth(conn.baseUrl);
    return {
      ok: !!openviking,
      openviking,
      resolvedBaseUrl: conn.baseUrl,
      dbPool: this.dynamicDS.getPoolStatus(),
    };
  }

  @Get('queue')
  async queue(@Req() req: AuthenticatedRequest) {
    await this.ensureTenantHasCustomOvConfig(req.tenantScope);
    const conn = await this.resolveOVConnection(req.tenantScope);
    return this.ovClient.request(conn, '/api/v1/observer/queue');
  }

  @Get('stats')
  async stats(@Req() req: AuthenticatedRequest) {
    await this.ensureTenantHasCustomOvConfig(req.tenantScope);
    const conn = await this.resolveOVConnection(req.tenantScope);
    const results = await Promise.allSettled([
      this.ovClient.request(conn, '/api/v1/observer/queue'),
      this.ovClient.request(conn, '/api/v1/observer/vikingdb'),
    ]);

    const queueRaw =
      results[0].status === 'fulfilled'
        ? (results[0].value as Record<string, unknown>)
        : null;
    const vikingdbRaw =
      results[1].status === 'fulfilled'
        ? (results[1].value as Record<string, unknown>)
        : null;

    // 解析队列文本表格
    const queue =
      queueRaw && (queueRaw.result as Record<string, unknown>)?.status
        ? parseQueueTable(
            (queueRaw.result as Record<string, unknown>).status as string,
          )
        : null;

    // 解析 VikingDB 文本表格
    let vikingdb = null;
    if (
      vikingdbRaw &&
      (vikingdbRaw.result as Record<string, unknown>)?.status
    ) {
      const parsed = parseVikingDBTable(
        (vikingdbRaw.result as Record<string, unknown>).status as string,
      );
      vikingdb = {
        collections: parsed.collections,
        totalCollections: parsed.collections.length,
        totalIndexCount: parseInt(parsed.total['Index Count'] || '0', 10),
        totalVectorCount: parseInt(parsed.total['Vector Count'] || '0', 10),
      };
    }

    return {
      queue,
      vikingdb,
    };
  }

  @Get('dashboard')
  async dashboard(@Req() req: AuthenticatedRequest) {
    return this.systemService.getDashboardStats(req.tenantScope);
  }

  @Post('reindex')
  async reindex(
    @Body() body: { uri: string },
    @Req() req: AuthenticatedRequest,
  ) {
    const conn = await this.resolveOVConnection(req.tenantScope);
    try {
      const data = await this.ovClient.request(
        conn,
        '/api/v1/resources/reindex',
        'POST',
        { uri: body.uri },
      );
      await this.auditService.log({
        tenantId: req.tenantScope ?? undefined,
        userId: req.user.id,
        username: req.user.username,
        action: 'reindex_resource',
        target: body.uri,
        meta: { requestId: req.headers['x-request-id'] },
        ip: req.ip,
      });
      return { ok: true, data };
    } catch (e) {
      const message = e instanceof Error ? e.message : '未知错误';
      return { ok: false, error: message };
    }
  }
}
