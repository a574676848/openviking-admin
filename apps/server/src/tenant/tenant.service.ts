import {
  Injectable,
  NotFoundException,
  ConflictException,
  Inject,
} from '@nestjs/common';
import { Tenant } from './entities/tenant.entity';
import { TENANT_REPOSITORY } from './domain/repositories/tenant.repository.interface';
import type { ITenantRepository } from './domain/repositories/tenant.repository.interface';
import { CreateTenantDto, UpdateTenantDto } from './dto/tenant.dto';
import { AuditService } from '../audit/audit.service';
import { SchemaInitializerService } from './schema-initializer.service';
import { TenantCacheService } from './tenant-cache.service';
import {
  TenantStatus,
  TenantIsolationLevel,
} from '../common/constants/system.enum';
import { EncryptionService } from '../common/encryption.service';

@Injectable()
export class TenantService {
  constructor(
    @Inject(TENANT_REPOSITORY)
    private readonly repo: ITenantRepository,
    private readonly auditService: AuditService,
    private readonly schemaInitializer: SchemaInitializerService,
    private readonly tenantCache: TenantCacheService,
    private readonly encryptionService: EncryptionService,
  ) {}

  findAll() {
    return this.repo.findAll();
  }

  async findOne(id: string) {
    const t = await this.repo.findById(id);
    if (!t) throw new NotFoundException(`租户 ID ${id} 不存在`);
    return t;
  }

  async create(dto: CreateTenantDto, adminContext?: any) {
    const exists = await this.repo.findByTenantId(dto.tenantId);
    if (exists)
      throw new ConflictException(`tenantId "${dto.tenantId}" 已存在`);

    // 加密 OV API Key
    if (dto.ovConfig?.apiKey) {
      dto.ovConfig.apiKey = this.encryptionService.encrypt(dto.ovConfig.apiKey);
    }

    // 使用枚举设置默认状态和等级
    const t = this.repo.create({
      ...dto,
      status: dto.status || TenantStatus.ACTIVE,
      isolationLevel: (dto.isolationLevel || TenantIsolationLevel.SMALL) as any,
    });

    const saved = await this.repo.save(t);

    // 物理隔离：初始化数据库 Schema
    try {
      await this.schemaInitializer.initialize({
        tenantId: saved.tenantId,
        isolationLevel: saved.isolationLevel as any,
        dbConfig: saved.dbConfig,
      });
    } catch (err) {
      // 标记初始化失败
      await this.repo.update(saved.id, { status: 'ERROR_INITIALIZING' });
    }

    if (adminContext) {
      await this.auditService.log({
        tenantId: undefined,
        userId: adminContext.id,
        username: adminContext.username,
        action: 'create_tenant',
        target: saved.tenantId,
        meta: { level: saved.isolationLevel, quota: saved.quota },
      });
    }

    return saved;
  }

  async update(id: string, dto: UpdateTenantDto, adminContext?: any) {
    const tenant = await this.findOne(id);

    // 加密 OV API Key
    if (dto.ovConfig?.apiKey) {
      dto.ovConfig.apiKey = this.encryptionService.encrypt(dto.ovConfig.apiKey);
    }

    await this.repo.update(id, dto);

    this.tenantCache.invalidate(tenant.tenantId);

    if (adminContext) {
      await this.auditService.log({
        tenantId: undefined,
        userId: adminContext.id,
        username: adminContext.username,
        action: 'update_tenant',
        target: tenant.tenantId,
        meta: { changes: dto },
      });
    }

    return this.findOne(id);
  }

  async remove(id: string, adminContext?: any) {
    const tenant = await this.findOne(id);
    await this.repo.delete(id);
    this.tenantCache.invalidate(tenant.tenantId);

    if (adminContext) {
      await this.auditService.log({
        tenantId: undefined,
        userId: adminContext.id,
        username: adminContext.username,
        action: 'delete_tenant',
        target: tenant.tenantId,
      });
    }
  }
}
