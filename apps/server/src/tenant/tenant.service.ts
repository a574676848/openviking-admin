import {
  Injectable,
  NotFoundException,
  ConflictException,
  Inject,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
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
import { UsersService } from '../users/users.service';
import { SystemRoles } from '../users/entities/user.entity';

const INITIAL_TENANT_ADMIN_USERNAME = 'admin';
const INITIAL_TENANT_ADMIN_PASSWORD_SUFFIX = '@123';
const TENANT_INITIALIZATION_FAILED_MESSAGE =
  '租户基础设施初始化失败，请检查租户数据库配置后重试。';

interface AdminContext {
  id: string;
  username: string;
}

@Injectable()
export class TenantService {
  private readonly logger = new Logger(TenantService.name);

  constructor(
    @Inject(TENANT_REPOSITORY)
    private readonly repo: ITenantRepository,
    private readonly auditService: AuditService,
    private readonly schemaInitializer: SchemaInitializerService,
    private readonly tenantCache: TenantCacheService,
    private readonly encryptionService: EncryptionService,
    private readonly usersService: UsersService,
  ) {}

  findAll() {
    return this.repo.findAll();
  }

  async findOne(id: string) {
    const t = await this.repo.findById(id);
    if (!t) throw new NotFoundException(`租户 ID ${id} 不存在`);
    return t;
  }

  async create(dto: CreateTenantDto, adminContext?: AdminContext) {
    const exists = await this.repo.findByTenantId(dto.tenantId);
    if (exists)
      throw new ConflictException(`tenantId "${dto.tenantId}" 已存在`);

    if (dto.ovConfig?.apiKey) {
      dto.ovConfig.apiKey = this.encryptionService.encrypt(dto.ovConfig.apiKey);
    }
    if (dto.ovConfig?.rerankApiKey) {
      dto.ovConfig.rerankApiKey = this.encryptionService.encrypt(
        dto.ovConfig.rerankApiKey,
      );
    }

    const t = this.repo.create({
      ...dto,
      status: dto.status || TenantStatus.ACTIVE,
      isolationLevel:
        (dto.isolationLevel as TenantIsolationLevel) ||
        TenantIsolationLevel.SMALL,
    });

    const saved = await this.repo.save(t);
    let createdAdminUser: { id: string } | null = null;

    try {
      createdAdminUser = await this.usersService.create({
        username: INITIAL_TENANT_ADMIN_USERNAME,
        password: `${saved.tenantId}${INITIAL_TENANT_ADMIN_PASSWORD_SUFFIX}`,
        role: SystemRoles.TENANT_ADMIN,
        tenantId: saved.id,
      });
      await this.schemaInitializer.initialize({
        tenantId: saved.tenantId,
        isolationLevel: saved.isolationLevel,
        dbConfig: saved.dbConfig ?? undefined,
      });
    } catch (error) {
      await this.rollbackFailedTenantCreation(saved.id, saved.tenantId, createdAdminUser?.id);
      const message = error instanceof Error ? error.message : '未知错误';
      throw new InternalServerErrorException(
        `${TENANT_INITIALIZATION_FAILED_MESSAGE} ${message}`,
      );
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

  async update(id: string, dto: UpdateTenantDto, adminContext?: AdminContext) {
    const tenant = await this.findOne(id);

    if (dto.ovConfig?.apiKey) {
      dto.ovConfig.apiKey = this.encryptionService.encrypt(dto.ovConfig.apiKey);
    }
    if (dto.ovConfig?.rerankApiKey) {
      dto.ovConfig.rerankApiKey = this.encryptionService.encrypt(
        dto.ovConfig.rerankApiKey,
      );
    }

    if (dto.dbConfig) {
      dto.dbConfig = {
        ...(tenant.dbConfig ?? {}),
        ...Object.fromEntries(
          Object.entries(dto.dbConfig).filter(([, value]) => value !== undefined),
        ),
      };
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

  async updateStatus(
    id: string,
    status: TenantStatus,
    adminContext?: AdminContext,
  ) {
    const tenant = await this.findOne(id);

    if (tenant.status === status) {
      return tenant;
    }

    await this.repo.update(id, { status });
    this.tenantCache.invalidate(tenant.tenantId);

    if (adminContext) {
      await this.auditService.log({
        tenantId: undefined,
        userId: adminContext.id,
        username: adminContext.username,
        action: 'update_tenant_status',
        target: tenant.tenantId,
        meta: { from: tenant.status, to: status },
      });
    }

    return this.findOne(id);
  }

  async remove(id: string, adminContext?: AdminContext) {
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

  private async rollbackFailedTenantCreation(
    tenantRecordId: string,
    tenantId: string,
    adminUserId?: string,
  ): Promise<void> {
    const cleanupTasks: Promise<unknown>[] = [this.repo.purge(tenantRecordId)];

    if (adminUserId) {
      cleanupTasks.push(this.usersService.remove(adminUserId, tenantRecordId));
    }

    const results = await Promise.allSettled(cleanupTasks);
    const failedTask = results.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );

    if (failedTask) {
      const reason =
        failedTask.reason instanceof Error
          ? failedTask.reason.message
          : String(failedTask.reason);
      this.logger.error(
        `租户 [${tenantId}] 初始化失败后回滚不完整：${reason}`,
      );
    }
  }
}
