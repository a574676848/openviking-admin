import { NotFoundException } from '@nestjs/common';
import { KnowledgeBaseService } from './knowledge-base.service';

describe('KnowledgeBaseService', () => {
  const kbRepo = {
    findAll: jest.fn(),
    findById: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
    createWithUri: jest.fn(),
  };
  const tenantService = {
    findOne: jest.fn(),
    findOneByIdOrTenantId: jest.fn(),
  };
  const service = new KnowledgeBaseService(
    kbRepo as never,
    tenantService as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('跨租户查询知识库时应拒绝访问', async () => {
    kbRepo.findById.mockResolvedValue(null);

    await expect(service.findOne('kb-1', 'tenant-a')).rejects.toThrow(
      NotFoundException,
    );
    expect(kbRepo.findById).toHaveBeenCalledWith('kb-1', 'tenant-a');
  });

  it('跨租户更新知识库时应拒绝访问', async () => {
    kbRepo.findById.mockResolvedValue(null);

    await expect(
      service.update('kb-1', { name: '新的名称' }, 'tenant-a'),
    ).rejects.toThrow(NotFoundException);
  });

  it('跨租户删除知识库时应拒绝访问', async () => {
    kbRepo.findById.mockResolvedValue(null);

    await expect(service.remove('kb-1', 'tenant-a')).rejects.toThrow(
      NotFoundException,
    );
    expect(kbRepo.delete).not.toHaveBeenCalled();
  });

  it('创建知识库时应支持用业务 tenantId 解析租户', async () => {
    tenantService.findOneByIdOrTenantId.mockResolvedValue({
      id: 'tenant-1',
      tenantId: 'mem',
      quota: { maxDocs: 10 },
    });
    kbRepo.count.mockResolvedValue(0);
    kbRepo.createWithUri.mockResolvedValue({
      id: 'kb-1',
      tenantId: 'mem',
      name: '记忆',
    });

    const result = await service.create({
      name: '记忆',
      description: '',
      tenantId: 'mem',
      vikingUri: 'viking://resources/mem/',
    });

    expect(tenantService.findOneByIdOrTenantId).toHaveBeenCalledWith('mem');
    expect(kbRepo.count).toHaveBeenCalledWith({ where: { tenantId: 'mem' } });
    expect(kbRepo.createWithUri).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'mem', name: '记忆' }),
    );
    expect(result).toEqual(
      expect.objectContaining({ id: 'kb-1', tenantId: 'mem' }),
    );
  });
});
