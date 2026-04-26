import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { OVClientService } from '../common/ov-client.service';

@Controller()
export class PublicHealthController {
  constructor(
    private readonly dataSource: DataSource,
    private readonly ovClient: OVClientService,
    private readonly configService: ConfigService,
  ) {}

  @Get('healthz')
  livez() {
    return {
      ok: true,
      service: 'openviking-admin',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('readyz')
  async readyz() {
    const dbReady = await this.checkDatabase();
    const ovReady = await this.checkOpenViking();
    const ready = dbReady && ovReady;

    return {
      ok: ready,
      checks: {
        database: dbReady ? 'ok' : 'error',
        openviking: ovReady ? 'ok' : 'error',
      },
      timestamp: new Date().toISOString(),
    };
  }

  private async checkDatabase() {
    try {
      await this.dataSource.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  private async checkOpenViking() {
    const baseUrl = this.configService.get<string>('OV_BASE_URL');
    if (!baseUrl) {
      return false;
    }

    const health = await this.ovClient.getHealth(baseUrl);
    return !!health;
  }
}
