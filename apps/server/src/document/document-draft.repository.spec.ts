import { DocumentDraftRepository } from './document-draft.repository';

describe('DocumentDraftRepository', () => {
  let repository: DocumentDraftRepository;
  let mockRepo: {
    findOne: jest.Mock;
    find: jest.Mock;
    save: jest.Mock;
    create: jest.Mock;
    delete: jest.Mock;
    remove: jest.Mock;
    createQueryBuilder: jest.Mock;
  };

  beforeEach(() => {
    mockRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      save: jest.fn(),
      create: jest.fn((data) => ({ ...data })),
      delete: jest.fn(),
      remove: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    const request = { tenantDataSource: null, tenantQueryRunner: null };
    repository = new DocumentDraftRepository(
      request as never,
      mockRepo as never,
    );
  });

  describe('deleteByNode', () => {
    it('应正确删除指定节点的草稿', async () => {
      mockRepo.delete.mockResolvedValue({ affected: 1 });

      await repository.deleteByNode('node-1', 'tenant-1');

      expect(mockRepo.delete).toHaveBeenCalledWith({
        nodeId: 'node-1',
        tenantId: 'tenant-1',
      });
    });

    it('当 tenantId 为 null 时应使用 undefined', async () => {
      mockRepo.delete.mockResolvedValue({ affected: 0 });

      await repository.deleteByNode('node-2', null);

      expect(mockRepo.delete).toHaveBeenCalledWith({
        nodeId: 'node-2',
        tenantId: undefined,
      });
    });
  });

  describe('deleteOrphanDrafts', () => {
    it('应删除无对应节点的孤儿草稿', async () => {
      const orphans = [
        { id: 'draft-1', nodeId: 'orphan-1' },
        { id: 'draft-2', nodeId: 'orphan-2' },
      ];
      const qb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(orphans),
      };
      mockRepo.createQueryBuilder.mockReturnValue(qb);
      mockRepo.remove.mockResolvedValue(orphans);

      const count = await repository.deleteOrphanDrafts('tenant-1');

      expect(count).toBe(2);
      expect(qb.andWhere).toHaveBeenCalledWith(
        'draft."tenantId" = :tenantId',
        { tenantId: 'tenant-1' },
      );
      expect(mockRepo.remove).toHaveBeenCalledWith(orphans);
    });

    it('无孤儿草稿时应返回 0', async () => {
      const qb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };
      mockRepo.createQueryBuilder.mockReturnValue(qb);

      const count = await repository.deleteOrphanDrafts(null);

      expect(count).toBe(0);
      expect(qb.andWhere).not.toHaveBeenCalled();
      expect(mockRepo.remove).not.toHaveBeenCalled();
    });
  });
});
