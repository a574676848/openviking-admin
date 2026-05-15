import { KnowledgeTreeController } from './knowledge-tree.controller';
import type { AuthenticatedRequest } from '../common/authenticated-request.interface';
import { RolesGuard } from '../common/roles.guard';
import { Reflector } from '@nestjs/core';
import type { ExecutionContext } from '@nestjs/common';
import { SystemRoles } from '../users/entities/user.entity';
import {
  KNOWLEDGE_NODE_KIND_DOCUMENT,
  KNOWLEDGE_TREE_DOCUMENT_FILE_EXTENSION,
} from './constants';

describe('KnowledgeTreeController', () => {
  const treeService = {
    create: jest.fn(),
    createFile: jest.fn(),
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

  function createRoleContext(role: string): ExecutionContext {
    return {
      getHandler: () => controller.create,
      getClass: () => KnowledgeTreeController,
      switchToHttp: () => ({
        getRequest: () => ({ user: { role } }),
      }),
    } as unknown as ExecutionContext;
  }

  it('create 默认创建目录节点并写入审计日志', async () => {
    treeService.create.mockResolvedValue({
      id: 'node-1',
      kbId: 'kb-1',
      name: '节点 A',
      kind: 'collection',
      vikingUri: 'viking://resources/tenant-alpha/kb-1/node-1/',
    });

    await controller.create({ kbId: 'kb-1', name: '节点 A' }, req);

    expect(treeService.create).toHaveBeenCalledWith(
      {
        kbId: 'kb-1',
        name: '节点 A',
        tenantId: 'tenant-alpha',
      },
      { id: 'user-1', username: 'alice' },
    );

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'create_knowledge_node',
        target: 'node-1',
        tenantId: 'tenant-alpha',
        meta: expect.objectContaining({
          kind: 'collection',
        }),
      }),
    );
  });

  it('create 接收 document 类型时复用文档节点创建分支', async () => {
    treeService.createFile.mockResolvedValue({
      id: 'node-doc',
      kbId: 'kb-1',
      name: '协作文档',
      kind: 'document',
      contentUri: null,
      vikingUri: 'viking://resources/tenant-alpha/kb-1/node-doc/',
    });

    const result = await controller.create(
      {
        kbId: 'kb-1',
        parentId: 'node-root',
        name: '协作文档',
        kind: KNOWLEDGE_NODE_KIND_DOCUMENT,
      },
      req,
    );

    expect(treeService.create).not.toHaveBeenCalled();
    expect(treeService.createFile).toHaveBeenCalledWith(
      {
        kbId: 'kb-1',
        parentId: 'node-root',
        name: '协作文档',
        tenantId: 'tenant-alpha',
        fileExtension: KNOWLEDGE_TREE_DOCUMENT_FILE_EXTENSION,
      },
      { id: 'user-1', username: 'alice' },
    );
    expect(result).toEqual(expect.objectContaining({ id: 'node-doc' }));
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'create_knowledge_node',
        target: 'node-doc',
        meta: expect.objectContaining({
          kind: 'document',
          name: '协作文档',
        }),
      }),
    );
  });

  it('create 的角色元数据拒绝只读用户创建节点', () => {
    const guard = new RolesGuard(new Reflector());

    expect(
      guard.canActivate(createRoleContext(SystemRoles.TENANT_VIEWER)),
    ).toBe(false);
    expect(
      guard.canActivate(createRoleContext(SystemRoles.TENANT_OPERATOR)),
    ).toBe(true);
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

    await controller.move('node-1', { parentId: null, sortOrder: 3 }, req);

    expect(treeService.update).toHaveBeenCalledWith(
      'node-1',
      { parentId: null, sortOrder: 3 },
      'tenant-alpha',
      { id: 'user-1', username: 'alice' },
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
