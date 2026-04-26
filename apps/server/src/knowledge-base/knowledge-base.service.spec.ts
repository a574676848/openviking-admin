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
  };
  const tenantService = {
    findOne: jest.fn(),
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
});
