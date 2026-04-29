import {
  Injectable,
  NotFoundException,
  Inject,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { Repository } from 'typeorm';
import { USER_REPOSITORY } from './domain/repositories/user.repository.interface';
import type { IUserRepository } from './domain/repositories/user.repository.interface';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';
import type { UserModel } from './domain/user.model';
import { Tenant } from '../tenant/entities/tenant.entity';

@Injectable()
export class UsersService {
  private static readonly UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepo: IUserRepository,
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
  ) {}

  async findAll(tenantId: string | null) {
    const tenantRecordId = await this.resolveTenantRecordId(tenantId);
    return this.userRepo.findAll(tenantRecordId);
  }

  async findOne(id: string, tenantId: string | null) {
    const tenantRecordId = await this.resolveTenantRecordId(tenantId);
    const user = await this.userRepo.findById(id, tenantRecordId);
    if (!user) throw new NotFoundException('用户不存在或无权访问');
    return user;
  }

  async create(
    dto: CreateUserDto & { tenantId?: string; passwordHash?: string },
  ) {
    const tenantRecordId = await this.resolveTenantRecordId(dto.tenantId ?? null);
    const existing = await this.userRepo.findByUsername(
      dto.username,
      tenantRecordId,
    );
    if (existing) {
      throw new ConflictException(`账号 "${dto.username}" 已存在`);
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = this.userRepo.create({
      ...dto,
      tenantId: tenantRecordId ?? undefined,
      passwordHash,
    } as Partial<UserModel>);
    return this.userRepo.save(user);
  }

  async update(id: string, dto: UpdateUserDto, tenantId: string | null) {
    const tenantRecordId = await this.resolveTenantRecordId(tenantId);
    const user = await this.findOne(id, tenantRecordId);
    if (dto.password) {
      user.passwordHash = await bcrypt.hash(dto.password, 10);
    }
    if (dto.role !== undefined) user.role = dto.role;
    if (dto.tenantId !== undefined) {
      user.tenantId = await this.resolveTenantRecordId(dto.tenantId);
    }
    if (dto.active !== undefined) user.active = dto.active;
    return this.userRepo.save(user);
  }

  async remove(id: string, tenantId: string | null) {
    const tenantRecordId = await this.resolveTenantRecordId(tenantId);
    const user = await this.findOne(id, tenantRecordId);
    await this.userRepo.delete(user.id);
    return user;
  }

  private async resolveTenantRecordId(tenantScope: string | null | undefined) {
    if (!tenantScope) {
      return null;
    }

    const tenant = await this.tenantRepo.findOne({
      where: UsersService.UUID_PATTERN.test(tenantScope)
        ? [{ id: tenantScope }, { tenantId: tenantScope }]
        : { tenantId: tenantScope },
    });
    return tenant?.id ?? tenantScope;
  }
}
