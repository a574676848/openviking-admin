import { Injectable, Inject, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Integration } from '../../entities/integration.entity';
import { IIntegrationRepository } from '../../domain/repositories/integration.repository.interface';

@Injectable({ scope: Scope.REQUEST })
export class IntegrationRepositoryImpl implements IIntegrationRepository {
  constructor(
    @Inject(REQUEST) private readonly request: any,
    @InjectRepository(Integration)
    private readonly defaultRepo: Repository<Integration>,
  ) {}

  private get repo(): Repository<Integration> {
    if (this.request?.tenantQueryRunner) {
      return this.request.tenantQueryRunner.manager.getRepository(Integration);
    }
    if (this.request?.tenantDataSource) {
      return this.request.tenantDataSource.getRepository(Integration);
    }
    return this.defaultRepo;
  }

  async find(options: any): Promise<Integration[]> {
    return this.repo.find(options);
  }

  async findOne(options: any): Promise<Integration | null> {
    return this.repo.findOne(options);
  }

  async save(integration: Partial<Integration>): Promise<Integration> {
    if ((integration as any).id) {
      const existing = await this.repo.findOne({
        where: { id: (integration as any).id },
      });
      if (existing) {
        return this.repo.save({ ...existing, ...integration });
      }
    }
    return this.repo.save(this.repo.create(integration));
  }

  async remove(integration: Integration): Promise<Integration> {
    return this.repo.remove(integration);
  }
}
