import {
  Injectable,
  NotFoundException,
  Inject,
  ConflictException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { USER_REPOSITORY } from './domain/repositories/user.repository.interface';
import type { IUserRepository } from './domain/repositories/user.repository.interface';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';
import type { UserModel } from './domain/user.model';

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
    const existing = await this.userRepo.findByUsername(
      dto.username,
      dto.tenantId ?? null,
    );
    if (existing) {
      throw new ConflictException(`账号 "${dto.username}" 已存在`);
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = this.userRepo.create({ ...dto, passwordHash } as Partial<UserModel>);
    return this.userRepo.save(user);
  }

  async update(id: string, dto: UpdateUserDto, tenantId: string | null) {
    const user = await this.findOne(id, tenantId);
    if (dto.password) {
      user.passwordHash = await bcrypt.hash(dto.password, 10);
    }
    if (dto.role !== undefined) user.role = dto.role;
    if (dto.tenantId !== undefined) user.tenantId = dto.tenantId;
    if (dto.active !== undefined) user.active = dto.active;
    return this.userRepo.save(user);
  }

  async remove(id: string, tenantId: string | null) {
    const user = await this.findOne(id, tenantId);
    await this.userRepo.delete(user.id);
    return user;
  }
}
