import { Injectable, UnauthorizedException, Inject } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { SystemRoles } from '../users/entities/user.entity';
import type { UserModel } from '../users/domain/user.model';
import { LoginDto } from './dto/login.dto';
import { AuditService } from '../audit/audit.service';
import { USER_REPOSITORY } from '../users/domain/repositories/user.repository.interface';
import type { IUserRepository } from '../users/domain/repositories/user.repository.interface';
import { TENANT_REPOSITORY } from '../tenant/domain/repositories/tenant.repository.interface';
import type { ITenantRepository } from '../tenant/domain/repositories/tenant.repository.interface';
import type { TenantOvConfig } from '../tenant/domain/tenant.model';

type AuthTokenPayload = {
  sub: string;
  username: string;
  role: string;
  tenantId: string | null;
  scope: string;
  isAdminSwitch?: boolean;
};

type SessionUserPayload = {
  id: string;
  username: string;
  role: string;
  tenantId: string | null;
  hasCustomOvConfig: boolean;
};

type AuthContextPayload = Pick<
  AuthTokenPayload,
  'role' | 'tenantId' | 'isAdminSwitch'
>;

const CUSTOM_OV_CONFIG_FIELDS: Array<keyof TenantOvConfig> = [
  'baseUrl',
  'apiKey',
  'account',
  'rerankEndpoint',
  'rerankApiKey',
  'rerankModel',
];

@Injectable()
export class AuthService {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepo: IUserRepository,
    @Inject(TENANT_REPOSITORY)
    private readonly tenantRepo: ITenantRepository,
    private readonly jwtService: JwtService,
    private readonly auditService: AuditService,
  ) {}

  async login(dto: LoginDto, ip?: string) {
    let user: UserModel | null = null;
    let tenantId: string | null = null;

    if (dto.tenantCode) {
      const tenant = await this.tenantRepo.findByTenantId(dto.tenantCode);
      tenantId = tenant?.id ?? null;

      if (!tenant) {
        await this.auditService.log({
          username: dto.username,
          action: 'login',
          success: false,
          ip,
          meta: { reason: '租户校验失败' },
        });
        throw new UnauthorizedException('租户信息不匹配');
      }

      const tenantUser = await this.userRepo.findByUsername(dto.username, tenant.id);
      const platformUser = await this.userRepo.findByUsername(dto.username, null);

      user = await this.resolveTenantLoginUser(
        dto.password,
        tenantUser,
        platformUser,
      );
    } else {
      user = await this.userRepo.findByUsername(dto.username, null);
    }

    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      await this.auditService.log({
        username: dto.username,
        action: 'login',
        success: false,
        ip,
        meta: { reason: '用户名或密码错误' },
      });
      throw new UnauthorizedException('用户名或密码错误');
    }

    // 校验租户逻辑
    if (dto.tenantCode) {
      if (
        user.role !== SystemRoles.SUPER_ADMIN &&
        user.tenantId !== tenantId
      ) {
        await this.auditService.log({
          userId: user.id,
          username: user.username,
          action: 'login',
          success: false,
          ip,
          meta: { reason: '租户校验失败' },
        });
        throw new UnauthorizedException('租户信息不匹配');
      }
    } else if (user.role !== SystemRoles.SUPER_ADMIN) {
      // 租户用户必须提供 tenantCode
      throw new UnauthorizedException('租户用户必须提供租户编码');
    }

    await this.auditService.log({
      userId: user.id,
      username: user.username,
      action: 'login',
      success: true,
      ip,
    });

    const tenantScopedAdminLogin =
      Boolean(dto.tenantCode) &&
      user.role === SystemRoles.SUPER_ADMIN &&
      Boolean(tenantId);
    const payload: AuthTokenPayload = {
      sub: user.id,
      username: user.username,
      role: tenantScopedAdminLogin ? SystemRoles.TENANT_ADMIN : user.role,
      tenantId: tenantScopedAdminLogin ? tenantId : user.tenantId || null,
      scope: tenantScopedAdminLogin || user.tenantId ? 'tenant' : 'platform',
      isAdminSwitch: tenantScopedAdminLogin ? true : undefined,
    };

    return {
      ...this.issueTokenPair(payload),
      user: await this.buildSessionUserForAuthContext(user, payload),
    };
  }

  async validateUser(userId: string): Promise<UserModel | null> {
    return this.userRepo.findById(userId);
  }

  async buildSessionUser(user: UserModel): Promise<SessionUserPayload> {
    return {
      id: user.id,
      username: user.username,
      role: user.role,
      tenantId: user.tenantId || null,
      hasCustomOvConfig: await this.hasCustomOvConfig(user.tenantId),
    };
  }

  async buildSessionUserForAuthContext(
    user: UserModel,
    authContext: AuthContextPayload,
  ): Promise<SessionUserPayload> {
    if (
      authContext.isAdminSwitch &&
      user.role === SystemRoles.SUPER_ADMIN &&
      authContext.tenantId
    ) {
      return {
        id: user.id,
        username: user.username,
        role: authContext.role,
        tenantId: authContext.tenantId,
        hasCustomOvConfig: await this.hasCustomOvConfig(authContext.tenantId),
      };
    }

    return this.buildSessionUser(user);
  }

  generateToken(user: UserModel) {
    const payload: AuthTokenPayload = {
      sub: user.id,
      username: user.username,
      role: user.role,
      tenantId: user.tenantId || null,
      scope: user.role === SystemRoles.SUPER_ADMIN ? 'platform' : 'tenant',
    };
    return this.issueTokenPair(payload);
  }

  async refreshAccessToken(refreshToken: string) {
    let payload: AuthTokenPayload & { tokenType?: string };

    try {
      payload = this.jwtService.verify<AuthTokenPayload & { tokenType?: string }>(
        refreshToken,
      );
    } catch {
      throw new UnauthorizedException('refresh token 无效或已过期');
    }

    if (payload.tokenType !== 'refresh_token') {
      throw new UnauthorizedException('refresh token 类型错误');
    }

    const user = await this.userRepo.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedException('用户不存在');
    }

    const nextPayload: AuthTokenPayload = {
      sub: user.id,
      username: user.username,
      role: payload.isAdminSwitch ? SystemRoles.TENANT_ADMIN : user.role,
      tenantId: payload.tenantId,
      scope: payload.scope,
      isAdminSwitch: payload.isAdminSwitch,
    };

    return this.issueTokenPair(nextPayload);
  }

  async switchRole(adminId: string, tenantId: string) {
    const admin = await this.userRepo.findById(adminId);
    if (!admin || admin.role !== SystemRoles.SUPER_ADMIN) {
      throw new UnauthorizedException('仅超管可执行视角切换');
    }

    const tenant = await this.tenantRepo.findById(tenantId);
    if (!tenant) throw new UnauthorizedException('目标租户不存在');

    await this.auditService.log({
      tenantId: undefined,
      userId: admin.id,
      username: admin.username,
      action: 'switch_role',
      target: tenant.tenantId,
      meta: { impersonating: tenant.displayName },
    });

    const payload: AuthTokenPayload = {
      sub: admin.id,
      username: admin.username,
      role: SystemRoles.TENANT_ADMIN, // 模拟为租户管理员
      tenantId: tenant.id,
      scope: 'tenant',
      isAdminSwitch: true, // 标记为超管切换
    };

    return {
      ...this.issueTokenPair(payload),
      tenantName: tenant.displayName,
    };
  }

  private issueTokenPair(payload: AuthTokenPayload) {
    const accessExpiresInSeconds = 2 * 60 * 60;
    const refreshExpiresInSeconds = 7 * 24 * 60 * 60;

    return {
      accessToken: this.jwtService.sign(
        { ...payload, tokenType: 'access_token' },
        { expiresIn: `${accessExpiresInSeconds}s` },
      ),
      refreshToken: this.jwtService.sign(
        { ...payload, tokenType: 'refresh_token' },
        { expiresIn: `${refreshExpiresInSeconds}s` },
      ),
      expiresInSeconds: accessExpiresInSeconds,
      refreshExpiresInSeconds,
    };
  }

  private async resolveTenantLoginUser(
    password: string,
    tenantUser: UserModel | null,
    platformUser: UserModel | null,
  ): Promise<UserModel | null> {
    if (tenantUser && (await bcrypt.compare(password, tenantUser.passwordHash))) {
      return tenantUser;
    }

    if (
      platformUser?.role === SystemRoles.SUPER_ADMIN &&
      (await bcrypt.compare(password, platformUser.passwordHash))
    ) {
      return platformUser;
    }

    return null;
  }

  private async hasCustomOvConfig(
    tenantRecordId: string | null | undefined,
  ): Promise<boolean> {
    if (!tenantRecordId) {
      return false;
    }

    const tenant = await this.tenantRepo.findById(tenantRecordId);
    if (!tenant?.ovConfig) {
      return false;
    }

    return CUSTOM_OV_CONFIG_FIELDS.some((field) => {
      const value = tenant.ovConfig?.[field];
      return typeof value === 'string' ? value.trim().length > 0 : Boolean(value);
    });
  }
}
