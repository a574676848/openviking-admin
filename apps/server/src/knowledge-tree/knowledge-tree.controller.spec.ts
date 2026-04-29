import { KnowledgeTreeController } from './knowledge-tree.controller';
import type { AuthenticatedRequest } from '../common/authenticated-request.interface';

describe('KnowledgeTreeController', () => {
  const treeService = {
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };
  const auditService = {
    log: jest.fn(),
  };
  const controller = new KnowledgeTreeController(
    treeService as never,
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

  it('create 后应写入审计日志', async () => {
    treeService.create.mockResolvedValue({
      id: 'node-1',
      kbId: 'kb-1',
      name: '节点 A',
      vikingUri: 'viking://resources/tenant-alpha/kb-1/node-1/',
    });

    await controller.create({ kbId: 'kb-1', title: '节点 A' } as never, req);

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'create_knowledge_node',
        target: 'node-1',
        tenantId: 'tenant-alpha',
      }),
    );
  });

  it('move 后应写入审计日志', async () => {
    treeService.update.mockResolvedValue({ id: 'node-1' });

    await controller.move(
      'node-1',
      { parentId: 'parent-1', sortOrder: 3 },
      req,
    );

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'move_knowledge_node',
        target: 'node-1',
        meta: expect.objectContaining({
          parentId: 'parent-1',
          sortOrder: 3,
        }),
      }),
    );
  });

  it('move 到根目录时应清空父节点', async () => {
    treeService.update.mockResolvedValue({ id: 'node-1' });

    await controller.move(
      'node-1',
      { parentId: null, sortOrder: 3 },
      req,
    );

    expect(treeService.update).toHaveBeenCalledWith(
      'node-1',
      { parentId: null, sortOrder: 3 },
      'tenant-alpha',
    );
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'move_knowledge_node',
        target: 'node-1',
        meta: expect.objectContaining({
          parentId: null,
          sortOrder: 3,
        }),
      }),
    );
  });
});
