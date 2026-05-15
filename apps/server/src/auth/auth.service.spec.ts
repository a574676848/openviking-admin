import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { AuditService } from '../audit/audit.service';
import { SystemRoles } from '../users/entities/user.entity';
import { USER_REPOSITORY } from '../users/domain/repositories/user.repository.interface';
import type { IUserRepository } from '../users/domain/repositories/user.repository.interface';
import { TENANT_REPOSITORY } from '../tenant/domain/repositories/tenant.repository.interface';
import type { ITenantRepository } from '../tenant/domain/repositories/tenant.repository.interface';
import type { UserModel } from '../users/domain/user.model';
import type { TenantModel } from '../tenant/domain/tenant.model';

function createUser(overrides: Partial<UserModel> = {}): UserModel {
  return {
    id: 'user-1',
    username: 'alice',
    passwordHash: 'hashed',
    role: SystemRoles.TENANT_ADMIN,
    tenantId: 'tenant-1',
    active: true,
    ssoId: null,
    provider: null,
    createdAt: new Date('2026-05-15T00:00:00.000Z'),
    updatedAt: new Date('2026-05-15T00:00:00.000Z'),
    ...overrides,
  };
}

function createTenant(overrides: Partial<TenantModel> = {}): TenantModel {
  return {
    id: 'tenant-1',
    tenantId: 'acme',
    displayName: 'Acme',
    status: 'active',
    isolationLevel: 'small' as TenantModel['isolationLevel'],
    dbConfig: null,
    vikingAccount: null,
    quota: null,
    ovConfig: null,
    description: null,
    createdAt: new Date('2026-05-15T00:00:00.000Z'),
    updatedAt: new Date('2026-05-15T00:00:00.000Z'),
    deletedAt: null,
    ...overrides,
  };
}

describe('AuthService', () => {
  let service: AuthService;
  let jwtService: jest.Mocked<Pick<JwtService, 'sign' | 'verify'>>;
  let mockUserRepo: jest.Mocked<
    Pick<IUserRepository, 'findByUsername' | 'findById'>
  >;
  let mockTenantRepo: jest.Mocked<
    Pick<ITenantRepository, 'findByTenantId' | 'findById'>
  >;

  beforeEach(async () => {
    mockUserRepo = {
      findByUsername: jest.fn(),
      findById: jest.fn(),
    };
    mockTenantRepo = {
      findByTenantId: jest.fn(),
      findById: jest.fn(),
    };
    jwtService = {
      sign: jest.fn((payload: object) => JSON.stringify(payload)) as never,
      verify: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: USER_REPOSITORY, useValue: mockUserRepo },
        { provide: TENANT_REPOSITORY, useValue: mockTenantRepo },
        { provide: JwtService, useValue: jwtService },
        { provide: AuditService, useValue: { log: jest.fn() } },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('login', () => {
    it('应该在密码错误时抛出 UnauthorizedException', async () => {
      mockUserRepo.findByUsername.mockResolvedValue(createUser({
        username: 'test',
        passwordHash: await bcrypt.hash('correct', 10),
      }));

      await expect(
        service.login({ username: 'test', password: 'wrong' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('超管登录不带租户编码应该成功', async () => {
      const mockUser = createUser({
        id: '1',
        username: 'admin',
        passwordHash: await bcrypt.hash('pass', 10),
        role: SystemRoles.SUPER_ADMIN,
        tenantId: null,
      });
      mockUserRepo.findByUsername.mockResolvedValue(mockUser);

      const result = await service.login({
        username: 'admin',
        password: 'pass',
      });
      expect(result.accessToken).toContain('"tokenType":"access_token"');
      expect(result.refreshToken).toContain('"tokenType":"refresh_token"');
      expect(result.user.role).toBe('super_admin');
      expect(result.user.hasCustomOvConfig).toBe(false);
      expect(mockUserRepo.findByUsername).toHaveBeenCalledWith('admin', null);
    });

    it('租户登录应优先命中租户内同名账号', async () => {
      const tenantUser = createUser({
        id: 'tenant-user-1',
        username: 'admin',
        passwordHash: await bcrypt.hash('acme@123', 10),
        role: SystemRoles.TENANT_ADMIN,
        tenantId: 'tenant-1',
      });
      const superAdmin = createUser({
        id: 'platform-admin-1',
        username: 'admin',
        passwordHash: await bcrypt.hash('Admin@2026', 10),
        role: SystemRoles.SUPER_ADMIN,
        tenantId: null,
      });

      mockTenantRepo.findByTenantId.mockResolvedValue(createTenant());
      mockTenantRepo.findById.mockResolvedValue(createTenant({
        ovConfig: {
          baseUrl: 'http://tenant-ov.local',
        },
      }));
      mockUserRepo.findByUsername
        .mockResolvedValueOnce(tenantUser)
        .mockResolvedValueOnce(superAdmin);

      const result = await service.login({
        username: 'admin',
        password: 'acme@123',
        tenantCode: 'acme',
      });

      expect(result.user.id).toBe('tenant-user-1');
      expect(result.user.role).toBe('tenant_admin');
      expect(result.user.hasCustomOvConfig).toBe(true);
      expect(mockUserRepo.findByUsername).toHaveBeenNthCalledWith(
        1,
        'admin',
        'tenant-1',
      );
      expect(mockUserRepo.findByUsername).toHaveBeenNthCalledWith(
        2,
        'admin',
        null,
      );
    });

    it('超管带租户编码登录时应签发租户视角 token', async () => {
      const superAdmin = createUser({
        id: 'platform-admin-1',
        username: 'admin',
        passwordHash: await bcrypt.hash('Admin@2026', 10),
        role: SystemRoles.SUPER_ADMIN,
        tenantId: null,
      });

      mockTenantRepo.findByTenantId.mockResolvedValue(
        createTenant({ tenantId: 'test3' }),
      );
      mockTenantRepo.findById.mockResolvedValue(createTenant({
        tenantId: 'test3',
        ovConfig: {
          baseUrl: 'http://tenant-ov.local',
        },
      }));
      mockUserRepo.findByUsername
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(superAdmin);

      const result = await service.login({
        username: 'admin',
        password: 'Admin@2026',
        tenantCode: 'test3',
      });
      const accessPayload = JSON.parse(result.accessToken);

      expect(accessPayload).toEqual(
        expect.objectContaining({
          role: SystemRoles.TENANT_ADMIN,
          tenantId: 'tenant-1',
          scope: 'tenant',
          isAdminSwitch: true,
        }),
      );
      expect(result.user).toEqual(
        expect.objectContaining({
          id: 'platform-admin-1',
          role: SystemRoles.TENANT_ADMIN,
          tenantId: 'tenant-1',
          hasCustomOvConfig: true,
        }),
      );
    });
  });

  describe('refreshAccessToken', () => {
    it('应该基于 refresh token 重新签发 token pair', async () => {
      jwtService.verify.mockReturnValue({
        sub: 'user-1',
        username: 'alice',
        role: SystemRoles.TENANT_ADMIN,
        tenantId: 'tenant-1',
        scope: 'tenant',
        tokenType: 'refresh_token',
      });
      mockUserRepo.findById.mockResolvedValue(createUser({
        id: 'user-1',
        username: 'alice',
        role: SystemRoles.TENANT_ADMIN,
        tenantId: 'tenant-1',
      }));

      const result = await service.refreshAccessToken('refresh-token');

      expect(result.accessToken).toContain('"tokenType":"access_token"');
      expect(result.refreshToken).toContain('"tokenType":"refresh_token"');
      expect(mockUserRepo.findById).toHaveBeenCalledWith('user-1');
    });

    it('refresh token 类型错误时应该抛错', async () => {
      jwtService.verify.mockReturnValue({
        sub: 'user-1',
        username: 'alice',
        role: SystemRoles.TENANT_ADMIN,
        tenantId: 'tenant-1',
        scope: 'tenant',
        tokenType: 'access_token',
      });

      await expect(
        service.refreshAccessToken('invalid-refresh-token'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('verifyAccessToken', () => {
    it('应该返回已校验的 access token 载荷', () => {
      jwtService.verify.mockReturnValue({
        sub: 'user-1',
        username: 'alice',
        role: SystemRoles.TENANT_OPERATOR,
        tenantId: 'tenant-1',
        scope: 'tenant',
        tokenType: 'access_token',
      });

      expect(service.verifyAccessToken('access-token')).toEqual({
        sub: 'user-1',
        username: 'alice',
        role: SystemRoles.TENANT_OPERATOR,
        tenantId: 'tenant-1',
        scope: 'tenant',
        tokenType: 'access_token',
      });
    });

    it('token 类型不是 access token 时应该抛错', () => {
      jwtService.verify.mockReturnValue({
        sub: 'user-1',
        username: 'alice',
        role: SystemRoles.TENANT_OPERATOR,
        tenantId: 'tenant-1',
        scope: 'tenant',
        tokenType: 'refresh_token',
      });

      expect(() => service.verifyAccessToken('refresh-token')).toThrow(
        UnauthorizedException,
      );
    });
  });
});
