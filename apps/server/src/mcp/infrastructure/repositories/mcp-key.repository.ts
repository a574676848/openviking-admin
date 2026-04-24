import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserMcpKey } from '../../entities/user-mcp-key.entity';
import { IMcpKeyRepository } from '../../domain/repositories/mcp-key.repository.interface';

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
  find(options: any) {
    return this.repo.find(options);
  }
  findOne(options: any) {
    return this.repo.findOne(options);
  }
  count(options: any) {
    return this.repo.count(options);
  }
  remove(key: UserMcpKey) {
    return this.repo.remove(key);
  }
  update(id: string, data: Partial<UserMcpKey>) {
    return this.repo.update(id, data);
  }
}
