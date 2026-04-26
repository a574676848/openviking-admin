import { AuditClientLogController } from './audit-client-log.controller';

describe('AuditClientLogController', () => {
  const auditService = {
    log: jest.fn(),
  };

  const controller = new AuditClientLogController(auditService as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should sanitize sensitive payload before writing audit log', async () => {
    await controller.ingest(
      {
        level: 'error',
        message: 'fetch failed bearer ov-sk-secret-token',
        digest: 'eyJsecret.payload.signature',
        path: '/console/system',
        ts: 1714060800000,
      },
      {
        ip: '127.0.0.1',
        originalUrl: '/api/v1/audit/client-log',
        url: '/api/v1/audit/client-log',
        headers: {
          'x-request-id': 'request-1',
          'x-trace-id': 'trace-1',
          'user-agent': 'Vitest Browser',
        },
      } as never,
    );

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'client.error',
        meta: expect.objectContaining({
          level: 'error',
          requestId: 'request-1',
          traceId: 'trace-1',
        }),
      }),
    );
    expect(JSON.stringify((auditService.log as jest.Mock).mock.calls[0][0])).not.toContain(
      'ov-sk-secret-token',
    );
  });
});

