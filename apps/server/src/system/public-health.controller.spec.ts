import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { OVClientService } from '../common/ov-client.service';
import { PublicHealthController } from './public-health.controller';

describe('PublicHealthController', () => {
  const dataSource = {
    query: jest.fn(),
  } as unknown as DataSource;
  const ovClient = {
    getHealth: jest.fn(),
  } as unknown as OVClientService;
  const configService = {
    get: jest.fn(),
  } as unknown as ConfigService;
  const controller = new PublicHealthController(
    dataSource,
    ovClient,
    configService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('应返回匿名存活探针', () => {
    expect(controller.livez()).toEqual(
      expect.objectContaining({
        ok: true,
        service: 'openviking-admin',
      }),
    );
  });

  it('数据库与 OpenViking 就绪时应返回 ok', async () => {
    (dataSource.query as jest.Mock).mockResolvedValue([{ '?column?': 1 }]);
    (configService.get as jest.Mock).mockReturnValue('http://ov.test');
    (ovClient.getHealth as jest.Mock).mockResolvedValue({ ok: true });

    await expect(controller.readyz()).resolves.toEqual(
      expect.objectContaining({
        ok: true,
        checks: {
          database: 'ok',
          openviking: 'ok',
        },
      }),
    );
  });

  it('OpenViking 未就绪时应返回 error', async () => {
    (dataSource.query as jest.Mock).mockResolvedValue([{ '?column?': 1 }]);
    (configService.get as jest.Mock).mockReturnValue('http://ov.test');
    (ovClient.getHealth as jest.Mock).mockResolvedValue(null);

    await expect(controller.readyz()).resolves.toEqual(
      expect.objectContaining({
        ok: false,
        checks: {
          database: 'ok',
          openviking: 'error',
        },
      }),
    );
  });
});
