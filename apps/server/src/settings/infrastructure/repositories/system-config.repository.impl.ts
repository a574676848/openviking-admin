import { Injectable, Inject, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SystemConfig } from '../../entities/system-config.entity';
import { ISystemConfigRepository } from '../../domain/repositories/system-config.repository.interface';

@Injectable({ scope: Scope.REQUEST })
export class SystemConfigRepositoryImpl implements ISystemConfigRepository {
  constructor(
    @Inject(REQUEST) private readonly request: any,
    @InjectRepository(SystemConfig)
    private readonly defaultRepo: Repository<SystemConfig>,
  ) {}

  private get repo(): Repository<SystemConfig> {
    if (this.request?.tenantQueryRunner) {
      return this.request.tenantQueryRunner.manager.getRepository(SystemConfig);
    }
    if (this.request?.tenantDataSource) {
      return this.request.tenantDataSource.getRepository(SystemConfig);
    }
    return this.defaultRepo;
  }

  async find(options?: any): Promise<SystemConfig[]> {
    return this.repo.find(options);
  }

  async findOne(options: any): Promise<SystemConfig | null> {
    return this.repo.findOne(options);
  }

  async save(config: Partial<SystemConfig>): Promise<SystemConfig> {
    if (config.key) {
      const existing = await this.repo.findOne({ where: { key: config.key } });
      if (existing) {
        return this.repo.save({ ...existing, ...config });
      }
    }
    return this.repo.save(this.repo.create(config));
  }
}
