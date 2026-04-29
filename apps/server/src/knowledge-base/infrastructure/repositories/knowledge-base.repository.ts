import { Injectable, Inject, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, type FindManyOptions, type QueryRunner } from 'typeorm';
import { KnowledgeBase } from '../../entities/knowledge-base.entity';
import { IKnowledgeBaseRepository } from '../../domain/repositories/knowledge-base.repository.interface';
import type { KnowledgeBaseModel } from '../../domain/knowledge-base.model';
import type { RepositoryRequest } from '../../../common/repository-request.interface';
import type { RepositoryFindQuery } from '../../../common/repository-query.types';

@Injectable({ scope: Scope.REQUEST })
export class TypeOrmKnowledgeBaseRepository implements IKnowledgeBaseRepository {
  constructor(
    @Inject(REQUEST) private readonly request: RepositoryRequest,
    @InjectRepository(KnowledgeBase)
    private readonly defaultRepo: Repository<KnowledgeBase>,
  ) {}

  private get repo(): Repository<KnowledgeBase> {
    if (this.request?.tenantQueryRunner) {
      return this.request.tenantQueryRunner.manager.getRepository(
        KnowledgeBase,
      );
    }
    if (this.request?.tenantDataSource) {
      return this.request.tenantDataSource.getRepository(KnowledgeBase);
    }
    return this.defaultRepo;
  }

  private toModel(entity: KnowledgeBase): KnowledgeBaseModel {
    return {
      id: entity.id,
      name: entity.name,
      description: entity.description,
      tenantId: entity.tenantId,
      status: entity.status,
      vikingUri: entity.vikingUri,
      docCount: entity.docCount,
      vectorCount: entity.vectorCount,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }

  private toEntityInput(data: Partial<KnowledgeBaseModel>): Partial<KnowledgeBase> {
    return {
      id: data.id,
      name: data.name,
      description: data.description,
      tenantId: data.tenantId,
      status: data.status,
      vikingUri: data.vikingUri,
      docCount: data.docCount,
      vectorCount: data.vectorCount,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    };
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

  async findAll(tenantId: string | null): Promise<KnowledgeBaseModel[]> {
    const where = tenantId ? { tenantId } : {};
    const items = await this.repo.find({ where, order: { createdAt: 'DESC' } });
    return items.map((item) => this.toModel(item));
  }

  async findById(
    id: string,
    tenantId?: string | null,
  ): Promise<KnowledgeBaseModel | null> {
    const where: Record<string, string> = { id };
    if (tenantId) where.tenantId = tenantId;
    const entity = await this.repo.findOne({ where });
    return entity ? this.toModel(entity) : null;
  }

  async count(options?: RepositoryFindQuery<KnowledgeBaseModel>): Promise<number> {
    return this.repo.count({
      where: options?.where ?? {},
    } as FindManyOptions<KnowledgeBase>);
  }

  create(data: Partial<KnowledgeBaseModel>): KnowledgeBaseModel {
    return this.toModel(this.repo.create(this.toEntityInput(data)));
  }

  async save(kb: KnowledgeBaseModel): Promise<KnowledgeBaseModel> {
    const saved = await this.repo.save(this.repo.create(this.toEntityInput(kb)));
    return this.toModel(saved);
  }

  async delete(kb: KnowledgeBaseModel): Promise<void> {
    await this.repo.remove(this.repo.create(this.toEntityInput(kb)));
  }

  async createWithUri(data: Partial<KnowledgeBaseModel>): Promise<KnowledgeBaseModel> {
    const { queryRunner, releaseAfterUse } =
      await this.createTransactionalQueryRunner();
    const startedTransaction = !queryRunner.isTransactionActive;

    if (startedTransaction) {
      await queryRunner.startTransaction();
    }

    try {
      const entity = queryRunner.manager.create(KnowledgeBase, this.toEntityInput(data));
      const saved = await queryRunner.manager.save(entity);

      const fullUri = `viking://resources/tenants/${data.tenantId}/${saved.id}/`;
      await queryRunner.manager.update(KnowledgeBase, saved.id, { vikingUri: fullUri });

      if (startedTransaction) {
        await queryRunner.commitTransaction();
      }

      saved.vikingUri = fullUri;
      return this.toModel(saved);
    } catch (err) {
      if (startedTransaction) {
        await queryRunner.rollbackTransaction();
      }
      throw err;
    } finally {
      if (releaseAfterUse && !queryRunner.isReleased) {
        await queryRunner.release();
      }
    }
  }
}
