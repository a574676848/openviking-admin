import { Injectable, UnauthorizedException, Inject } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { User, SystemRoles } from '../users/entities/user.entity';
import { LoginDto } from './dto/login.dto';
import { AuditService } from '../audit/audit.service';
import { USER_REPOSITORY } from '../users/domain/repositories/user.repository.interface';
import type { IUserRepository } from '../users/domain/repositories/user.repository.interface';
import { TENANT_REPOSITORY } from '../tenant/domain/repositories/tenant.repository.interface';
import type { ITenantRepository } from '../tenant/domain/repositories/tenant.repository.interface';

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
    const user = await this.userRepo.findByUsername(dto.username);

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
      const tenant = await this.tenantRepo.findByTenantId(dto.tenantCode);
      if (
        !tenant ||
        (user.role !== SystemRoles.SUPER_ADMIN && user.tenantId !== tenant.id)
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

    const payload = {
      sub: user.id,
      username: user.username,
      role: user.role,
      tenantId: user.tenantId || null,
      scope: user.tenantId ? 'tenant' : 'platform',
    };

    return {
      accessToken: this.jwtService.sign(payload),
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        tenantId: user.tenantId || null,
      },
    };
  }

  async validateUser(userId: string): Promise<User | null> {
    return this.userRepo.findById(userId);
  }

  async generateToken(user: User) {
    const payload = {
      sub: user.id,
      username: user.username,
      role: user.role,
      tenantId: user.tenantId || null,
      scope: user.role === SystemRoles.SUPER_ADMIN ? 'platform' : 'tenant',
    };
    return {
      accessToken: this.jwtService.sign(payload),
    };
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

    const payload = {
      sub: admin.id,
      username: admin.username,
      role: SystemRoles.TENANT_ADMIN, // 模拟为租户管理员
      tenantId: tenant.id,
      scope: 'tenant',
      isAdminSwitch: true, // 标记为超管切换
    };

    return {
      accessToken: this.jwtService.sign(payload),
      tenantName: tenant.displayName,
    };
  }
}
