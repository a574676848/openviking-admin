import { SearchController } from './search.controller';
import type { AuthenticatedRequest } from '../common/authenticated-request.interface';

describe('SearchController audit', () => {
  const searchService = {
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
});
