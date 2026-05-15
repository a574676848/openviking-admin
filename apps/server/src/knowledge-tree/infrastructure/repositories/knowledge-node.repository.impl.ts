import { Injectable, Inject, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Repository,
  type FindManyOptions,
  type FindOneOptions,
  type QueryRunner,
} from 'typeorm';
import { KnowledgeNode } from '../../entities/knowledge-node.entity';
import { IKnowledgeNodeRepository } from '../../domain/repositories/knowledge-node.repository.interface';
import type {
  KnowledgeNodeIndexStatus,
  KnowledgeNodeKind,
  KnowledgeNodeModel,
} from '../../domain/knowledge-node.model';
import type { RepositoryRequest } from '../../../common/repository-request.interface';
import type {
  RepositoryFindOneQuery,
  RepositoryFindQuery,
} from '../../../common/repository-query.types';

@Injectable({ scope: Scope.REQUEST })
export class KnowledgeNodeRepositoryImpl implements IKnowledgeNodeRepository {
  private static readonly RESOURCE_URI_PREFIX = 'viking://resources';
  private static readonly DEFAULT_INDEX_STATUS: KnowledgeNodeIndexStatus = 'clean';

  private inferKind(entity: Pick<KnowledgeNode, 'kind' | 'vikingUri'>): KnowledgeNodeKind {
    if (entity.kind === 'collection' || entity.kind === 'document') {
      return entity.kind;
    }

    return entity.vikingUri?.endsWith('/') ? 'collection' : 'document';
  }

  private inferContentUri(entity: Pick<KnowledgeNode, 'contentUri' | 'vikingUri' | 'kind'>) {
    if (entity.contentUri) {
      return entity.contentUri;
    }

    if (this.inferKind(entity) === 'document' && entity.vikingUri && !entity.vikingUri.endsWith('/')) {
      return entity.vikingUri;
    }

    return null;
  }

  constructor(
    @Inject(REQUEST) private readonly request: RepositoryRequest,
    @InjectRepository(KnowledgeNode)
    private readonly defaultRepo: Repository<KnowledgeNode>,
  ) {}

  private get repo(): Repository<KnowledgeNode> {
    if (this.request?.tenantQueryRunner) {
      return this.request.tenantQueryRunner.manager.getRepository(
        KnowledgeNode,
      );
    }
    if (this.request?.tenantDataSource) {
      return this.request.tenantDataSource.getRepository(KnowledgeNode);
    }
    return this.defaultRepo;
  }

  private toModel(entity: KnowledgeNode): KnowledgeNodeModel {
    return {
      id: entity.id,
      tenantId: entity.tenantId,
      kbId: entity.kbId,
      parentId: entity.parentId,
      name: entity.name,
      path: entity.path,
      sortOrder: entity.sortOrder,
      acl: entity.acl,
      kind: this.inferKind(entity),
      vikingUri: entity.vikingUri,
      contentUri: this.inferContentUri(entity),
      indexStatus: entity.indexStatus ?? KnowledgeNodeRepositoryImpl.DEFAULT_INDEX_STATUS,
      draftVersion: entity.draftVersion ?? 0,
      indexedVersion: entity.indexedVersion ?? 0,
      vectorCount: entity.vectorCount ?? null,
      lastIndexedAt: entity.lastIndexedAt ?? null,
      indexError: entity.indexError ?? null,
      createdById: entity.createdById,
      createdByName: entity.createdByName,
      updatedById: entity.updatedById,
      updatedByName: entity.updatedByName,
      createdBy: this.toActor(entity.createdById, entity.createdByName),
      updatedBy: this.toActor(entity.updatedById, entity.updatedByName),
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }

  private toActor(id: string | null, username: string | null) {
    if (!id && !username) {
      return null;
    }

    return { id, username };
  }

  private toEntityInput(
    node: Partial<KnowledgeNodeModel>,
  ): Partial<KnowledgeNode> {
    return {
      id: node.id,
      tenantId: node.tenantId ?? undefined,
      kbId: node.kbId,
      parentId: node.parentId,
      name: node.name,
      path: node.path ?? undefined,
      sortOrder: node.sortOrder,
      acl: node.acl ?? undefined,
      kind: node.kind ?? undefined,
      vikingUri: node.vikingUri ?? undefined,
      contentUri: node.contentUri === undefined ? undefined : node.contentUri,
      indexStatus: node.indexStatus ?? undefined,
      draftVersion: node.draftVersion ?? undefined,
      indexedVersion: node.indexedVersion ?? undefined,
      vectorCount: node.vectorCount === undefined ? undefined : node.vectorCount,
      lastIndexedAt: node.lastIndexedAt === undefined ? undefined : node.lastIndexedAt,
      indexError: node.indexError === undefined ? undefined : node.indexError,
      createdById: node.createdById ?? undefined,
      createdByName: node.createdByName ?? undefined,
      updatedById: node.updatedById ?? undefined,
      updatedByName: node.updatedByName ?? undefined,
      createdAt: node.createdAt,
      updatedAt: node.updatedAt,
    };
  }

  private buildVikingUri(node: {
    tenantId: string;
    kbId: string;
    id: string;
  }): string {
    return `${KnowledgeNodeRepositoryImpl.RESOURCE_URI_PREFIX}/tenants/${node.tenantId}/${node.kbId}/${node.id}/`;
  }

  private async createTransactionalQueryRunner(): Promise<{
    queryRunner: QueryRunner;
    releaseAfterUse: boolean;
  }> {
    if (this.request?.tenantQueryRunner) {
      return {
        queryRunner: this.request.tenantQueryRunner,
        releaseAfterUse: false,
      };
    }

    const connection =
      this.request?.tenantDataSource ?? this.repo.manager.connection;
    const queryRunner = connection.createQueryRunner();
    await queryRunner.connect();
    return {
      queryRunner,
      releaseAfterUse: true,
    };
  }

  async find(
    options: RepositoryFindQuery<KnowledgeNodeModel>,
  ): Promise<KnowledgeNodeModel[]> {
    const items = await this.repo.find(
      options as FindManyOptions<KnowledgeNode>,
    );
    return items.map((item) => this.toModel(item));
  }

  async findOne(
    options: RepositoryFindOneQuery<KnowledgeNodeModel>,
  ): Promise<KnowledgeNodeModel | null> {
    const item = await this.repo.findOne(
      options as FindOneOptions<KnowledgeNode>,
    );
    return item ? this.toModel(item) : null;
  }

  async save(node: Partial<KnowledgeNodeModel>): Promise<KnowledgeNodeModel> {
    if (node.id) {
      const existing = await this.repo.findOne({
        where: { id: node.id },
      });
      if (existing) {
        const saved = await this.repo.save({
          ...existing,
          ...this.toEntityInput(node),
        });
        return this.toModel(saved);
      }
    }
    const saved = await this.repo.save(
      this.repo.create(this.toEntityInput(node)),
    );
    return this.toModel(saved);
  }

  async createWithGeneratedUri(
    node: Partial<KnowledgeNodeModel>,
  ): Promise<KnowledgeNodeModel> {
    if (!node.tenantId || !node.kbId) {
      throw new Error('生成节点资源 URI 缺少 tenantId 或 kbId。');
    }

    const { queryRunner, releaseAfterUse } =
      await this.createTransactionalQueryRunner();
    const startedTransaction = !queryRunner.isTransactionActive;

    if (startedTransaction) {
      await queryRunner.startTransaction();
    }

    try {
      const entity = queryRunner.manager.create(
        KnowledgeNode,
        this.toEntityInput({
          ...node,
          kind: 'collection',
          vikingUri: undefined,
          contentUri: undefined,
        }),
      );
      const saved = await queryRunner.manager.save(entity);
      const vikingUri = this.buildVikingUri({
        tenantId: node.tenantId,
        kbId: node.kbId,
        id: saved.id,
      });

      await queryRunner.manager.update(KnowledgeNode, saved.id, {
        kind: 'collection',
        vikingUri,
        contentUri: null,
      });

      if (startedTransaction) {
        await queryRunner.commitTransaction();
      }

      saved.kind = 'collection';
      saved.vikingUri = vikingUri;
      saved.contentUri = null;
      return this.toModel(saved);
    } catch (error) {
      if (startedTransaction) {
        await queryRunner.rollbackTransaction();
      }
      throw error;
    } finally {
      if (releaseAfterUse && !queryRunner.isReleased) {
        await queryRunner.release();
      }
    }
  }

  async createFileWithGeneratedUri(
    node: Partial<KnowledgeNodeModel> & { fileExtension: string },
  ): Promise<KnowledgeNodeModel> {
    if (!node.tenantId || !node.kbId) {
      throw new Error('生成文件节点资源 URI 缺少 tenantId 或 kbId。');
    }

    const { queryRunner, releaseAfterUse } =
      await this.createTransactionalQueryRunner();
    const startedTransaction = !queryRunner.isTransactionActive;

    if (startedTransaction) {
      await queryRunner.startTransaction();
    }

    try {
      const entity = queryRunner.manager.create(
        KnowledgeNode,
        this.toEntityInput({
          ...node,
          kind: 'document',
          vikingUri: undefined,
          contentUri: undefined,
        }),
      );
      const saved = await queryRunner.manager.save(entity);
      const vikingUri = this.buildVikingUri({
        tenantId: node.tenantId,
        kbId: node.kbId,
        id: saved.id,
      });

      await queryRunner.manager.update(KnowledgeNode, saved.id, {
        kind: 'document',
        vikingUri,
        contentUri: null,
      });

      if (startedTransaction) {
        await queryRunner.commitTransaction();
      }

      saved.kind = 'document';
      saved.vikingUri = vikingUri;
      saved.contentUri = null;
      return this.toModel(saved);
    } catch (error) {
      if (startedTransaction) {
        await queryRunner.rollbackTransaction();
      }
      throw error;
    } finally {
      if (releaseAfterUse && !queryRunner.isReleased) {
        await queryRunner.release();
      }
    }
  }

  async remove(node: KnowledgeNodeModel): Promise<KnowledgeNodeModel> {
    const removed = await this.repo.remove(
      this.repo.create(this.toEntityInput(node)),
    );
    return this.toModel(removed);
  }

  async findAllowedUris(
    tenantId: string,
    user: { id: string; role: string },
  ): Promise<string[]> {
    const queryBuilder = this.repo
      .createQueryBuilder('node')
      .where('node.tenantId = :tenantId', { tenantId })
      .andWhere('node.vikingUri IS NOT NULL');

    queryBuilder.andWhere(
      `(
        (node.acl->>'isPublic' = 'true' OR node.acl IS NULL)
        OR (node.acl->'roles' ? :role)
        OR (node.acl->'users' ? :userId)
      )`,
      { role: user.role, userId: user.id },
    );

    const nodes = await queryBuilder.getMany();
    return Array.from(
      new Set(
        nodes.flatMap((node) =>
          [node.vikingUri, node.contentUri].filter(
            (uri): uri is string => Boolean(uri),
          ),
        ),
      ),
    );
  }

  async aggregateKnowledgeBaseStats(
    kbId: string,
    tenantId: string | null,
  ): Promise<{ docCount: number; vectorCount: number }> {
    const query = this.repo
      .createQueryBuilder('node')
      .select('COUNT(node.id)', 'docCount')
      .addSelect('COALESCE(SUM(node.vectorCount), 0)', 'vectorCount')
      .where('node.kbId = :kbId', { kbId })
      .andWhere('node.kind = :kind', { kind: 'document' });

    if (tenantId) {
      query.andWhere('node.tenantId = :tenantId', { tenantId });
    }

    const raw = await query.getRawOne<{
      docCount?: string | number | null;
      vectorCount?: string | number | null;
    }>();

    return {
      docCount: this.toNonNegativeInteger(raw?.docCount),
      vectorCount: this.toNonNegativeInteger(raw?.vectorCount),
    };
  }

  private toNonNegativeInteger(value: string | number | null | undefined): number {
    const parsed = Number(value ?? 0);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return 0;
    }
    return Math.trunc(parsed);
  }

  async findChildrenWithCount(
    kbId: string,
    parentId: string | null,
    tenantId: string | null,
  ): Promise<(KnowledgeNodeModel & { childrenCount: number })[]> {
    const where: Record<string, any> = { kbId };
    if (tenantId) {
      where.tenantId = tenantId;
    }
    where.parentId = parentId === null ? null : parentId;

    const nodes = await this.repo.find({
      where,
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });

    if (nodes.length === 0) return [];

    const nodeIds = nodes.map((n) => n.id);
    
    const countQuery = this.repo.createQueryBuilder('child')
      .select('child.parentId', 'parentId')
      .addSelect('COUNT(child.id)', 'count')
      .where('child.parentId IN (:...nodeIds)', { nodeIds })
      .groupBy('child.parentId');
      
    if (tenantId) {
      countQuery.andWhere('child.tenantId = :tenantId', { tenantId });
    }

    const counts = await countQuery.getRawMany();
    const countMap = new Map(counts.map((c) => [c.parentId, parseInt(c.count, 10)]));

    return nodes.map((node) => ({
      ...this.toModel(node),
      childrenCount: countMap.get(node.id) || 0,
    }));
  }

  async findLineageWithSiblings(
    kbId: string,
    nodeId: string,
    tenantId: string | null,
  ): Promise<(KnowledgeNodeModel & { childrenCount: number })[]> {
    // 1. Traverse upwards to find all ancestor parentIds
    const parentIdsToLoad = new Set<string | null>();
    parentIdsToLoad.add(null); // Always load root level

    let currentId: string | null = nodeId;
    while (currentId) {
      const where: Record<string, any> = { id: currentId, kbId };
      if (tenantId) where.tenantId = tenantId;
      
      const node = await this.repo.findOne({ where, select: ['id', 'parentId'] });
      if (!node) break;
      
      parentIdsToLoad.add(node.parentId);
      currentId = node.parentId;
    }

    // 2. Load all nodes whose parentId is in the set
    const queryBuilder = this.repo.createQueryBuilder('node')
      .where('node.kbId = :kbId', { kbId });

    if (tenantId) {
      queryBuilder.andWhere('node.tenantId = :tenantId', { tenantId });
    }

    const parentIdsArray = Array.from(parentIdsToLoad);
    const hasNull = parentIdsArray.includes(null);
    const nonNullParentIds = parentIdsArray.filter(id => id !== null);

    if (hasNull && nonNullParentIds.length > 0) {
      queryBuilder.andWhere('(node.parentId IS NULL OR node.parentId IN (:...nonNullParentIds))', { nonNullParentIds });
    } else if (hasNull) {
      queryBuilder.andWhere('node.parentId IS NULL');
    } else {
      queryBuilder.andWhere('node.parentId IN (:...nonNullParentIds)', { nonNullParentIds });
    }

    queryBuilder.orderBy('node.sortOrder', 'ASC').addOrderBy('node.createdAt', 'ASC');

    const nodes = await queryBuilder.getMany();
    if (nodes.length === 0) return [];

    // 3. Compute children count
    const nodeIds = nodes.map((n) => n.id);
    const countQuery = this.repo.createQueryBuilder('child')
      .select('child.parentId', 'parentId')
      .addSelect('COUNT(child.id)', 'count')
      .where('child.parentId IN (:...nodeIds)', { nodeIds })
      .groupBy('child.parentId');
      
    if (tenantId) {
      countQuery.andWhere('child.tenantId = :tenantId', { tenantId });
    }

    const counts = await countQuery.getRawMany();
    const countMap = new Map(counts.map((c) => [c.parentId, parseInt(c.count, 10)]));

    return nodes.map((node) => ({
      ...this.toModel(node),
      childrenCount: countMap.get(node.id) || 0,
    }));
  }
}
