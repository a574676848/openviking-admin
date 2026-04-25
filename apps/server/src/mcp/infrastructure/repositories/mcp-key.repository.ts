import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, type FindManyOptions, type FindOneOptions } from 'typeorm';
import { UserMcpKey } from '../../entities/user-mcp-key.entity';
import type { IMcpKeyRepository } from '../../domain/repositories/mcp-key.repository.interface';

@Injectable()
export class TypeOrmMcpKeyRepository implements IMcpKeyRepository {
  constructor(
    @InjectRepository(UserMcpKey)
    private readonly repo: Repository<UserMcpKey>,
  ) {}

  create(data: Partial<UserMcpKey>) {
    return this.repo.create(data);
  }
  save(key: UserMcpKey) {
    return this.repo.save(key);
  }
  find(options: FindManyOptions<UserMcpKey>) {
    return this.repo.find(options);
  }
  findOne(options: FindOneOptions<UserMcpKey>) {
    return this.repo.findOne(options);
  }
  count(options: FindManyOptions<UserMcpKey>) {
    return this.repo.count(options);
  }
  remove(key: UserMcpKey) {
    return this.repo.remove(key);
  }
  update(id: string, data: Partial<UserMcpKey>) {
    return this.repo.update(id, data);
  }
}
