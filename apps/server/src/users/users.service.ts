import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import { User } from './entities/user.entity';
import { USER_REPOSITORY } from './domain/repositories/user.repository.interface';
import type { IUserRepository } from './domain/repositories/user.repository.interface';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';

@Injectable()
export class UsersService {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepo: IUserRepository,
  ) {}

  findAll(tenantId: string | null) {
    return this.userRepo.findAll(tenantId);
  }

  async findOne(id: string, tenantId: string | null) {
    const user = await this.userRepo.findById(id, tenantId);
    if (!user) throw new NotFoundException('用户不存在或无权访问');
    return user;
  }

  async create(
    dto: CreateUserDto & { tenantId?: string; passwordHash?: string },
  ) {
    const user = this.userRepo.create(dto as any);
    return this.userRepo.save(user);
  }

  async update(id: string, dto: UpdateUserDto, tenantId: string | null) {
    const user = await this.findOne(id, tenantId);
    Object.assign(user, dto);
    return this.userRepo.save(user);
  }

  async remove(id: string, tenantId: string | null) {
    const user = await this.findOne(id, tenantId);
    await this.userRepo.delete(user.id);
    return user;
  }
}
