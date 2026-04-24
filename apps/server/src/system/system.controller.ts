import { Controller, Get, Post, Body, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../common/tenant.guard';
import { SettingsService } from '../settings/settings.service';
import { OVClientService } from '../common/ov-client.service';
import { SystemService } from './system.service';
import { DynamicDataSourceService } from '../common/dynamic-datasource.service';

@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('system')
export class SystemController {
  constructor(
    private readonly settings: SettingsService,
    private readonly ovClient: OVClientService,
    private readonly systemService: SystemService,
    private readonly dynamicDS: DynamicDataSourceService,
  ) {}

  @Get('health')
  async health(@Req() req: any) {
    const config = await this.settings.resolveOVConfig(req.tenantScope);
    const baseUrl = config.baseUrl || 'http://localhost:1933';
    const openviking = await this.ovClient.getHealth(baseUrl);
    const dbPool = this.dynamicDS.getPoolStatus();
    return { ok: !!openviking, openviking, resolvedBaseUrl: baseUrl, dbPool };
  }

  @Get('queue')
  async queue(@Req() req: any) {
    const config = await this.settings.resolveOVConfig(req.tenantScope);
    const conn = {
      baseUrl: config.baseUrl || 'http://localhost:1933',
      apiKey: config.apiKey || '',
      account: config.account || '',
    };
    return this.ovClient.request(conn, '/api/v1/observer/queue');
  }

  @Get('stats')
  async stats(@Req() req: any) {
    const config = await this.settings.resolveOVConfig(req.tenantScope);
    const conn = {
      baseUrl: config.baseUrl || 'http://localhost:1933',
      apiKey: config.apiKey || '',
      account: config.account || '',
    };
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
  async dashboard(@Req() req: any) {
    return this.systemService.getDashboardStats(req.tenantScope);
  }

  @Post('reindex')
  async reindex(@Body() body: { uri: string }, @Req() req: any) {
    const config = await this.settings.resolveOVConfig(req.tenantScope);
    const conn = {
      baseUrl: config.baseUrl || 'http://localhost:1933',
      apiKey: config.apiKey || '',
      account: config.account || '',
    };
    try {
      const data = await this.ovClient.request(
        conn,
        '/api/v1/resources/reindex',
        'POST',
        { uri: body.uri },
      );
      return { ok: true, data };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  }
}
