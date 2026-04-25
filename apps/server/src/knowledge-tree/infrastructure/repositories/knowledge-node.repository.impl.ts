import { Injectable, Inject, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, type FindManyOptions, type FindOneOptions } from 'typeorm';
import { KnowledgeNode } from '../../entities/knowledge-node.entity';
import { IKnowledgeNodeRepository } from '../../domain/repositories/knowledge-node.repository.interface';
import type { RepositoryRequest } from '../../../common/repository-request.interface';

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

  async find(
    options: FindManyOptions<KnowledgeNode>,
  ): Promise<KnowledgeNode[]> {
    return this.repo.find(options);
  }

  async findOne(
    options: FindOneOptions<KnowledgeNode>,
  ): Promise<KnowledgeNode | null> {
    return this.repo.findOne(options);
  }

  async save(node: Partial<KnowledgeNode>): Promise<KnowledgeNode> {
    if (node.id) {
      const existing = await this.repo.findOne({
        where: { id: node.id },
      });
      if (existing) {
        return this.repo.save({ ...existing, ...node });
      }
    }
    return this.repo.save(this.repo.create(node));
  }

  async remove(node: KnowledgeNode): Promise<KnowledgeNode> {
    return this.repo.remove(node);
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
