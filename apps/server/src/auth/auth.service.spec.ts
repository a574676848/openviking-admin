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
      mockUserRepo.findByUsername.mockResolvedValue({
        username: 'test',
        passwordHash: await bcrypt.hash('correct', 10),
      } as never);

      await expect(
        service.login({ username: 'test', password: 'wrong' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('超管登录不带租户编码应该成功', async () => {
      const mockUser = {
        id: '1',
        username: 'admin',
        passwordHash: await bcrypt.hash('pass', 10),
        role: 'super_admin',
      };
      mockUserRepo.findByUsername.mockResolvedValue(mockUser as never);

      const result = await service.login({
        username: 'admin',
        password: 'pass',
      });
      expect(result.accessToken).toContain('"tokenType":"access_token"');
      expect(result.refreshToken).toContain('"tokenType":"refresh_token"');
      expect(result.user.role).toBe('super_admin');
      expect(mockUserRepo.findByUsername).toHaveBeenCalledWith('admin', null);
    });

    it('租户登录应优先命中租户内同名账号', async () => {
      const tenantUser = {
        id: 'tenant-user-1',
        username: 'admin',
        passwordHash: await bcrypt.hash('acme@123', 10),
        role: 'tenant_admin',
        tenantId: 'tenant-1',
      };
      const superAdmin = {
        id: 'platform-admin-1',
        username: 'admin',
        passwordHash: await bcrypt.hash('Admin@2026', 10),
        role: 'super_admin',
        tenantId: null,
      };

      mockTenantRepo.findByTenantId.mockResolvedValue({
        id: 'tenant-1',
        tenantId: 'acme',
      } as never);
      mockUserRepo.findByUsername
        .mockResolvedValueOnce(tenantUser as never)
        .mockResolvedValueOnce(superAdmin as never);

      const result = await service.login({
        username: 'admin',
        password: 'acme@123',
        tenantCode: 'acme',
      });

      expect(result.user.id).toBe('tenant-user-1');
      expect(result.user.role).toBe('tenant_admin');
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
      mockUserRepo.findById.mockResolvedValue({
        id: 'user-1',
        username: 'alice',
        role: SystemRoles.TENANT_ADMIN,
        tenantId: 'tenant-1',
      } as never);

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
});
