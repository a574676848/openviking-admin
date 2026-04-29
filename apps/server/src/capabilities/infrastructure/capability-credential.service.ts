import { randomBytes } from 'crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tenant } from '../../tenant/entities/tenant.entity';
import { User } from '../../users/entities/user.entity';
import { SystemConfig } from '../../settings/entities/system-config.entity';
import { CapabilityKey } from '../entities/capability-key.entity';
import { EncryptionService } from '../../common/encryption.service';
import {
  ClientType,
  CredentialType,
  OVConfigProfile,
  Principal,
} from '../domain/capability.types';
import { resolveCredentialTtlSeconds } from '../domain/credential-ttl.policy';
import { buildTenantIdentityWhere } from '../../tenant/tenant-identity.util';

interface JwtLikePayload {
  sub?: string;
  username?: string;
  role?: string;
  tenantId?: string | null;
  scope?: string;
  tokenType?: CredentialType | 'capability_access_token';
}

@Injectable()
export class CapabilityCredentialService {
  constructor(
    @InjectRepository(CapabilityKey)
    private readonly keyRepo: Repository<CapabilityKey>,
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(SystemConfig)
    private readonly configRepo: Repository<SystemConfig>,
    private readonly encryptionService: EncryptionService,
    private readonly jwtService: JwtService,
  ) {}

  async resolvePrincipalFromApiKey(
    apiKey: string,
    clientType: ClientType,
  ): Promise<Principal> {
    const keyRecord = await this.keyRepo.findOne({ where: { apiKey } });
    if (!keyRecord) {
      throw new UnauthorizedException('无效的 capability apiKey');
    }

    if (keyRecord.expiresAt && keyRecord.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('capability apiKey 已过期');
    }

    await this.keyRepo.update(keyRecord.id, { lastUsedAt: new Date() });
    const ovConfig = await this.loadOvConfigForTenant(keyRecord.tenantId);

    return {
      userId: keyRecord.userId,
      tenantId: keyRecord.tenantId,
      scope: 'tenant',
      credentialType: 'api_key',
      clientType,
      ovConfig,
    };
  }

  async resolvePrincipalFromJwt(
    token: string,
    clientType: ClientType,
  ): Promise<Principal> {
    let payload: JwtLikePayload;

    try {
      payload = this.jwtService.verify<JwtLikePayload>(token);
    } catch {
      throw new UnauthorizedException('无效或已过期的调用凭证');
    }

    if (!payload.sub || !payload.tenantId) {
      throw new ForbiddenException(
        '当前凭证缺少租户上下文，无法调用 capability',
      );
    }

    const ovConfig = await this.loadOvConfigForTenant(payload.tenantId);
    const tokenType = payload.tokenType ?? 'jwt_access_token';
    const credentialType: CredentialType =
      tokenType === 'capability_access_token'
        ? 'capability_access_token'
        : tokenType === 'session_key'
          ? 'session_key'
          : 'jwt_access_token';

    return {
      userId: payload.sub,
      username: payload.username,
      tenantId: payload.tenantId,
      role: payload.role,
      scope: payload.scope ?? 'tenant',
      credentialType,
      clientType,
      ovConfig,
    };
  }

  async resolvePrincipalFromAuthenticatedUser(
    user: {
      id: string;
      username: string;
      tenantId: string | null;
      role?: string;
      scope?: string;
    },
    clientType: ClientType,
    credentialType: CredentialType = 'jwt_access_token',
  ): Promise<Principal> {
    if (!user.tenantId) {
      throw new ForbiddenException('当前用户未绑定租户上下文');
    }

    return {
      userId: user.id,
      username: user.username,
      tenantId: user.tenantId,
      role: user.role,
      scope: user.scope ?? 'tenant',
      credentialType,
      clientType,
      ovConfig: await this.loadOvConfigForTenant(user.tenantId),
    };
  }

  async createApiKey(
    userId: string,
    tenantId: string,
    name: string,
    ttlSeconds?: number | null,
  ) {
    const user = await this.userRepo.findOne({
      where: { id: userId, tenantId },
    });
    if (!user || !user.active) {
      throw new NotFoundException('用户不存在或不可用');
    }

    const count = await this.keyRepo.count({ where: { userId } });
    if (count >= 10) {
      throw new ForbiddenException('每个用户最多创建 10 个 capability key');
    }

    let expiresAt: Date | null = null;
    try {
      const resolvedTtlSeconds = resolveCredentialTtlSeconds(
        'api_key',
        ttlSeconds,
      );
      expiresAt =
        resolvedTtlSeconds === null
          ? null
          : new Date(Date.now() + resolvedTtlSeconds * 1000);
    } catch {
      throw new BadRequestException('不支持的 API Key 有效期');
    }

    const apiKey = `ov-sk-${randomBytes(24).toString('base64url')}`;
    const entity = this.keyRepo.create({
      name: name || '未命名 capability key',
      apiKey,
      userId,
      tenantId,
      expiresAt,
    });

    return this.keyRepo.save(entity);
  }

  async getKeysByTenant(tenantId: string) {
    return this.keyRepo.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
    });
  }

  async deleteKey(id: string, tenantId: string) {
    const key = await this.keyRepo.findOne({ where: { id, tenantId } });
    if (!key) {
      throw new NotFoundException('Capability Key 不存在或无权操作');
    }

    await this.keyRepo.remove(key);
    return { success: true };
  }

  private async loadOvConfigForTenant(
    tenantId: string,
  ): Promise<OVConfigProfile> {
    const tenant = await this.tenantRepo.findOne({
      where: buildTenantIdentityWhere(tenantId),
    });

    if (tenant?.ovConfig?.apiKey) {
      return {
        ...tenant.ovConfig,
        apiKey: this.encryptionService.decrypt(tenant.ovConfig.apiKey),
        account: tenant.vikingAccount || tenant.ovConfig.account || 'default',
        user: tenant.ovConfig.user || null,
      } as OVConfigProfile;
    }

    const defaultConfig = await this.configRepo.findOne({
      where: { key: 'DEFAULT_OV_CONFIG' },
    });

    if (!defaultConfig) {
      throw new NotFoundException('该租户未配置 OpenViking 引擎连接');
    }

    const parsed = JSON.parse(
      this.encryptionService.decrypt(defaultConfig.value),
    ) as OVConfigProfile;

    if (!parsed.apiKey || !parsed.baseUrl) {
      throw new NotFoundException('该租户未配置 OpenViking 引擎连接');
    }

    return parsed;
  }
}
