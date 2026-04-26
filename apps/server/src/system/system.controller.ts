import {
  Controller,
  Get,
  Post,
  Body,
  Req,
  UseGuards,
  BadGatewayException,
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

@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('system')
export class SystemController {
  constructor(
    private readonly settings: SettingsService,
    private readonly ovClient: OVClientService,
    private readonly systemService: SystemService,
    private readonly dynamicDS: DynamicDataSourceService,
    private readonly auditService: AuditService,
  ) {}

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
    const conn = await this.resolveOVConnection(req.tenantScope);
    const openviking = await this.ovClient.getHealth(conn.baseUrl);
    const dbPool = this.dynamicDS.getPoolStatus();
    return {
      ok: !!openviking,
      openviking,
      resolvedBaseUrl: conn.baseUrl,
      dbPool,
    };
  }

  @Get('queue')
  async queue(@Req() req: AuthenticatedRequest) {
    const conn = await this.resolveOVConnection(req.tenantScope);
    return this.ovClient.request(conn, '/api/v1/observer/queue');
  }

  @Get('stats')
  async stats(@Req() req: AuthenticatedRequest) {
    const conn = await this.resolveOVConnection(req.tenantScope);
    const results = await Promise.allSettled([
      this.ovClient.request(conn, '/api/v1/observer/queue'),
      this.ovClient.request(conn, '/api/v1/observer/db/stats'),
    ]);
    return {
      queue: results[0].status === 'fulfilled' ? results[0].value : null,
      dbStats: results[1].status === 'fulfilled' ? results[1].value : null,
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
