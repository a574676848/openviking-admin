import { SearchController } from './search.controller';
import type { AuthenticatedRequest } from '../common/authenticated-request.interface';

describe('SearchController audit', () => {
  const searchService = {
    find: jest.fn(),
    setFeedback: jest.fn(),
  };
  const auditService = {
    log: jest.fn(),
  };
  const controller = new SearchController(
    searchService as never,
    auditService as never,
  );
  const req = {
    tenantScope: 'tenant-alpha',
    user: { id: 'user-1', username: 'alice' },
    headers: { 'x-request-id': 'request-1' },
    ip: '127.0.0.1',
  } as unknown as AuthenticatedRequest;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('提交检索反馈后应写入审计日志', async () => {
    searchService.setFeedback.mockResolvedValue({ id: 'log-1', feedback: 'helpful' });

    await controller.setFeedback(
      'log-1',
      { feedback: 'helpful', note: '命中预期' } as never,
      req,
    );

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'search_feedback',
        target: 'log-1',
        tenantId: 'tenant-alpha',
        meta: expect.objectContaining({
          feedback: 'helpful',
        }),
      }),
    );
  });

  it('检索请求应把租户头透传给 OpenViking 元信息', async () => {
    const findParams = { query: 'WebDAV', topK: 5 } as never;
    const findReq = {
      tenantScope: 'tenant-alpha',
      user: { id: 'user-1', username: 'alice', tenantId: 'tenant-alpha' },
      headers: {
        'x-trace-id': 'trace-1',
        'x-request-id': 'request-1',
        'x-openviking-account': 'tenant-alpha',
        'x-openviking-user': 'user-1',
      },
    } as unknown as AuthenticatedRequest;

    controller.find(findParams, findReq);

    expect(searchService.find).toHaveBeenCalledWith(
      findParams,
      'tenant-alpha',
      findReq.user,
      {
        traceId: 'trace-1',
        requestId: 'request-1',
        account: 'tenant-alpha',
        user: 'user-1',
      },
    );
  });
});
