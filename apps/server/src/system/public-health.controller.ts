import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { OVClientService } from '../common/ov-client.service';

const READYZ_CHECK_TIMEOUT_MS = 2_000;

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
    const [dbReady, ovReady] = await Promise.all([
      this.checkDatabase(),
      this.checkOpenViking(),
    ]);
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
      await this.raceWithTimeout(this.dataSource.query('SELECT 1'));
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

    try {
      const health = await this.raceWithTimeout(
        this.ovClient.getHealth(baseUrl),
      );
      return !!health;
    } catch {
      return false;
    }
  }

  // readyz 不能因为上游 OV / DB 长时间无响应而被一起拖死，统一加超时保护。
  private raceWithTimeout<T>(task: Promise<T>): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(
        () => reject(new Error('readyz 检查超时')),
        READYZ_CHECK_TIMEOUT_MS,
      );
    });
    return Promise.race([task, timeout]).finally(() => {
      if (timer) {
        clearTimeout(timer);
      }
    }) as Promise<T>;
  }
}
