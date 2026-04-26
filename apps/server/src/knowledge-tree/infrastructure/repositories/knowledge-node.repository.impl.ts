import { Injectable, Inject, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, type FindManyOptions, type FindOneOptions } from 'typeorm';
import { KnowledgeNode } from '../../entities/knowledge-node.entity';
import { IKnowledgeNodeRepository } from '../../domain/repositories/knowledge-node.repository.interface';
import type { KnowledgeNodeModel } from '../../domain/knowledge-node.model';
import type { RepositoryRequest } from '../../../common/repository-request.interface';
import type {
  RepositoryFindOneQuery,
  RepositoryFindQuery,
} from '../../../common/repository-query.types';

@Injectable({ scope: Scope.REQUEST })
export class KnowledgeNodeRepositoryImpl implements IKnowledgeNodeRepository {
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
      vikingUri: entity.vikingUri,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }

  private toEntityInput(node: Partial<KnowledgeNodeModel>): Partial<KnowledgeNode> {
    return {
      id: node.id,
      tenantId: node.tenantId ?? undefined,
      kbId: node.kbId,
      parentId: node.parentId,
      name: node.name,
      path: node.path ?? undefined,
      sortOrder: node.sortOrder,
      acl: node.acl ?? undefined,
      vikingUri: node.vikingUri ?? undefined,
      createdAt: node.createdAt,
      updatedAt: node.updatedAt,
    };
  }

  async find(
    options: RepositoryFindQuery<KnowledgeNodeModel>,
  ): Promise<KnowledgeNodeModel[]> {
    const items = await this.repo.find(options as FindManyOptions<KnowledgeNode>);
    return items.map((item) => this.toModel(item));
  }

  async findOne(
    options: RepositoryFindOneQuery<KnowledgeNodeModel>,
  ): Promise<KnowledgeNodeModel | null> {
    const item = await this.repo.findOne(options as FindOneOptions<KnowledgeNode>);
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

  async remove(node: KnowledgeNodeModel): Promise<KnowledgeNodeModel> {
    const removed = await this.repo.remove(this.repo.create(this.toEntityInput(node)));
    return this.toModel(removed);
  }

  async findAllowedUris(
    tenantId: string,
    user: { id: string; role: string },
  ): Promise<string[]> {
    const queryBuilder = this.repo
      .createQueryBuilder('node')
      .select('node.vikingUri')
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
    return nodes.map((n) => n.vikingUri);
  }
}
