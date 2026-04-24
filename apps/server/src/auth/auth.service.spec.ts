import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { USER_REPOSITORY } from './domain/repositories/user.repository.interface';
import { TENANT_REPOSITORY } from '../tenant/domain/repositories/tenant.repository.interface';
import { JwtService } from '@nestjs/jwt';
import { AuditService } from '../audit/audit.service';
import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';

describe('AuthService', () => {
  let service: AuthService;
  let mockUserRepo: any;
  let mockTenantRepo: any;

  beforeEach(async () => {
    mockUserRepo = {
      findOneByUsername: jest.fn(),
      findOneById: jest.fn(),
    };
    mockTenantRepo = {
      findByTenantId: jest.fn(),
      findById: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: USER_REPOSITORY, useValue: mockUserRepo },
        { provide: TENANT_REPOSITORY, useValue: mockTenantRepo },
        {
          provide: JwtService,
          useValue: { sign: jest.fn(() => 'mock-token') },
        },
        { provide: AuditService, useValue: { log: jest.fn() } },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('login', () => {
    it('应该在密码错误时抛出 UnauthorizedException', async () => {
      mockUserRepo.findOneByUsername.mockResolvedValue({
        username: 'test',
        passwordHash: await bcrypt.hash('correct', 10),
      });

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
      mockUserRepo.findOneByUsername.mockResolvedValue(mockUser);

      const result = await service.login({
        username: 'admin',
        password: 'pass',
      });
      expect(result.accessToken).toBe('mock-token');
      expect(result.user.role).toBe('super_admin');
    });
  });
});
