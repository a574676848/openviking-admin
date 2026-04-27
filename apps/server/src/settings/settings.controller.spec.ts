import { SettingsController } from './settings.controller';

describe('SettingsController', () => {
  const service = {
    findAll: jest.fn(),
    batchSet: jest.fn(),
    testConnection: jest.fn(),
  };

  const controller = new SettingsController(service as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('应透传测试连接请求到 service', async () => {
    service.testConnection.mockResolvedValue({
      ok: true,
      type: 'engine',
      message: '核心引擎连接成功',
      target: 'http://ov.default/health',
    });

    await expect(
      controller.testConnection({
        type: 'engine',
        baseUrl: 'http://ov.default',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        ok: true,
        type: 'engine',
      }),
    );

    expect(service.testConnection).toHaveBeenCalledWith({
      type: 'engine',
      baseUrl: 'http://ov.default',
    });
  });
});
