import { KnowledgeBaseController } from './knowledge-base.controller';

describe('KnowledgeBaseController', () => {
  const kbService = {
    create: jest.fn(),
    remove: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
  };
  const knowledgeTreeService = {
    findByKb: jest.fn(),
  };
  const auditService = {
    log: jest.fn(),
  };

  const controller = new KnowledgeBaseController(
    kbService as never,
    knowledgeTreeService as never,
    auditService as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('审计写入失败时应补偿删除已创建的知识库', async () => {
    kbService.create.mockResolvedValue({
      id: 'kb-1',
      name: '记忆',
    });
    auditService.log.mockRejectedValue(new Error('audit failed'));

    const request = {
      tenantScope: 'mem',
      user: {
        id: 'user-1',
        username: 'admin',
      },
      headers: {},
      ip: '127.0.0.1',
    };

    await expect(
      controller.create(
        {
          name: '记忆',
          description: '',
          tenantId: 'mem',
          vikingUri: 'viking://resources/mem/',
        },
        request as never,
      ),
    ).rejects.toThrow('audit failed');

    expect(kbService.create).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'mem' }),
    );
    expect(kbService.remove).toHaveBeenCalledWith('kb-1', 'mem', {
      user: 'admin',
    });
  });
});
