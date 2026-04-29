import { BadRequestException } from '@nestjs/common';
import { KnowledgeTreeService } from './knowledge-tree.service';

describe('KnowledgeTreeService', () => {
  const nodeRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    createWithGeneratedUri: jest.fn(),
    remove: jest.fn(),
    findAllowedUris: jest.fn(),
  };

  const service = new KnowledgeTreeService(nodeRepo as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('create 时应通过事务生成固定格式的 vikingUri', async () => {
    nodeRepo.createWithGeneratedUri.mockResolvedValue({
      id: 'node-1',
      tenantId: 'tenant-alpha',
      kbId: 'kb-1',
      name: '节点 A',
      vikingUri: 'viking://resources/tenant-alpha/kb-1/node-1/',
    });

    const created = await service.create({
      tenantId: 'tenant-alpha',
      kbId: 'kb-1',
      name: '节点 A',
    });

    expect(nodeRepo.createWithGeneratedUri).toHaveBeenCalledWith({
      tenantId: 'tenant-alpha',
      kbId: 'kb-1',
      name: '节点 A',
    });
    expect(created.vikingUri).toBe(
      'viking://resources/tenant-alpha/kb-1/node-1/',
    );
  });

  it('update 时不允许修改 vikingUri', async () => {
    nodeRepo.findOne.mockResolvedValue({
      id: 'node-1',
      tenantId: 'tenant-alpha',
      kbId: 'kb-1',
      name: '节点 A',
      vikingUri: 'viking://resources/tenant-alpha/kb-1/node-1/',
    });

    await expect(
      service.update(
        'node-1',
        { vikingUri: 'viking://resources/tenant-alpha/kb-1/other/' },
        'tenant-alpha',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(nodeRepo.save).not.toHaveBeenCalled();
  });

  it('update 时应保留并保存 acl 变更', async () => {
    nodeRepo.findOne.mockResolvedValue({
      id: 'node-1',
      tenantId: 'tenant-alpha',
      kbId: 'kb-1',
      name: '节点 A',
      vikingUri: 'viking://resources/tenant-alpha/kb-1/node-1/',
      acl: { isPublic: true, roles: [], users: [] },
    });
    nodeRepo.save.mockImplementation(async (node) => node);

    const updated = await service.update(
      'node-1',
      {
        acl: {
          isPublic: false,
          roles: ['tenant_viewer'],
          users: ['user-1'],
        },
      },
      'tenant-alpha',
    );

    expect(nodeRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        acl: {
          isPublic: false,
          roles: ['tenant_viewer'],
          users: ['user-1'],
        },
      }),
    );
    expect(updated).toEqual(
      expect.objectContaining({
        acl: {
          isPublic: false,
          roles: ['tenant_viewer'],
          users: ['user-1'],
        },
      }),
    );
  });
});
