import { Test, TestingModule } from '@nestjs/testing';
import { TenantService } from './tenant.service';
import { TENANT_REPOSITORY } from './domain/repositories/tenant.repository.interface';
import type { ITenantRepository } from './domain/repositories/tenant.repository.interface';
import { AuditService } from '../audit/audit.service';
import { SchemaInitializerService } from './schema-initializer.service';
import { TenantCacheService } from './tenant-cache.service';
import { Tenant } from './entities/tenant.entity';
import { EncryptionService } from '../common/encryption.service';
import { TenantStatus } from '../common/constants/system.enum';
import { UsersService } from '../users/users.service';

describe('TenantService', () => {
  let service: TenantService;
  let mockRepository: jest.Mocked<ITenantRepository>;
  let auditService: { log: jest.Mock };
  let tenantCache: { invalidate: jest.Mock };
  let usersService: { create: jest.Mock; remove: jest.Mock };

  beforeEach(async () => {
    mockRepository = {
      findAll: jest.fn(),
      findById: jest.fn(),
      findByTenantId: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      purge: jest.fn(),
    };

    auditService = { log: jest.fn() };
    tenantCache = { invalidate: jest.fn() };
    usersService = { create: jest.fn(), remove: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantService,
        { provide: TENANT_REPOSITORY, useValue: mockRepository },
        { provide: AuditService, useValue: auditService },
        {
          provide: SchemaInitializerService,
          useValue: { initialize: jest.fn() },
        },
        { provide: TenantCacheService, useValue: tenantCache },
        {
          provide: EncryptionService,
          useValue: { encrypt: jest.fn(), decrypt: jest.fn() },
        },
        { provide: UsersService, useValue: usersService },
      ],
    }).compile();

    service = module.get<TenantService>(TenantService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findOne', () => {
    it('should return a tenant if found', async () => {
      const mockTenant = new Tenant();
      mockTenant.id = '123';
      mockRepository.findById.mockResolvedValue(mockTenant);

      const result = await service.findOne('123');
      expect(result).toEqual(mockTenant);
    });

    it('should throw NotFoundException if not found', async () => {
      mockRepository.findById.mockResolvedValue(null);
      await expect(service.findOne('999')).rejects.toThrow(
        '租户 ID 999 不存在',
      );
    });
  });

  describe('findOneByIdOrTenantId', () => {
    it('should fallback to tenantId when id lookup misses', async () => {
      const mockTenant = {
        id: 'tenant-1',
        tenantId: 'mem',
      } as Tenant;
      mockRepository.findById.mockResolvedValue(null);
      mockRepository.findByTenantId.mockResolvedValue(mockTenant);

      const result = await service.findOneByIdOrTenantId('mem');

      expect(mockRepository.findById).toHaveBeenCalledWith('mem');
      expect(mockRepository.findByTenantId).toHaveBeenCalledWith('mem');
      expect(result).toBe(mockTenant);
    });
  });

  describe('updateStatus', () => {
    it('should update tenant status and write audit log', async () => {
      const mockTenant = {
        id: 'tenant-1',
        tenantId: 'acme',
        displayName: 'ACME',
        status: TenantStatus.ACTIVE,
        isolationLevel: 'small',
        dbConfig: null,
        vikingAccount: null,
        quota: null,
        ovConfig: null,
        description: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      } as unknown as Tenant;

      const updatedTenant = {
        ...mockTenant,
        status: TenantStatus.DISABLED,
      } as unknown as Tenant;

      mockRepository.findById
        .mockResolvedValueOnce(mockTenant)
        .mockResolvedValueOnce(updatedTenant);

      const result = await service.updateStatus(
        'tenant-1',
        TenantStatus.DISABLED,
        { id: 'admin-1', username: 'admin' },
      );

      expect(mockRepository.update).toHaveBeenCalledWith('tenant-1', {
        status: TenantStatus.DISABLED,
      });
      expect(tenantCache.invalidate).toHaveBeenCalledWith('acme');
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'update_tenant_status',
          target: 'acme',
          meta: { from: TenantStatus.ACTIVE, to: TenantStatus.DISABLED },
        }),
      );
      expect(result).toEqual(updatedTenant);
    });
  });

  describe('create', () => {
    it('should create initial tenant admin with tenant scoped password', async () => {
      const dto = {
        tenantId: 'acme',
        displayName: 'ACME',
      };
      const savedTenant = {
        id: 'tenant-1',
        tenantId: 'acme',
        displayName: 'ACME',
        status: TenantStatus.ACTIVE,
        isolationLevel: 'small',
        dbConfig: null,
        vikingAccount: null,
        quota: null,
        ovConfig: null,
        description: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      } as unknown as Tenant;

      mockRepository.findByTenantId.mockResolvedValue(null);
      mockRepository.create.mockReturnValue(savedTenant);
      mockRepository.save.mockResolvedValue(savedTenant);
      usersService.create.mockResolvedValue({
        id: 'user-1',
        username: 'admin',
        role: 'tenant_admin',
        tenantId: 'tenant-1',
      });

      const result = await service.create(dto);

      expect(usersService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          username: 'admin',
          password: 'acme@123',
          role: 'tenant_admin',
          tenantId: 'tenant-1',
        }),
      );
      expect(result).toEqual(savedTenant);
    });

    it('should rollback tenant and admin user when initialization fails', async () => {
      const dto = {
        tenantId: 'mem',
        displayName: '记忆系统',
        isolationLevel: 'large',
        dbConfig: {
          host: '192.168.10.99',
          port: 5432,
          username: 'postgres',
          password: 'secret',
          database: 'openviking_mem',
        },
      };
      const savedTenant = {
        id: 'tenant-large-1',
        tenantId: 'mem',
        displayName: '记忆系统',
        status: TenantStatus.ACTIVE,
        isolationLevel: 'large',
        dbConfig: dto.dbConfig,
        vikingAccount: null,
        quota: null,
        ovConfig: null,
        description: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      } as unknown as Tenant;

      mockRepository.findByTenantId.mockResolvedValue(null);
      mockRepository.create.mockReturnValue(savedTenant);
      mockRepository.save.mockResolvedValue(savedTenant);
      usersService.create.mockResolvedValue({
        id: 'user-1',
        username: 'admin',
        role: 'tenant_admin',
        tenantId: 'tenant-large-1',
      });

      const schemaInitializer = (
        service as unknown as {
          schemaInitializer: { initialize: jest.Mock };
        }
      ).schemaInitializer;
      schemaInitializer.initialize.mockRejectedValue(
        new Error('独立数据库创建失败'),
      );

      await expect(service.create(dto)).rejects.toThrow(
        '租户基础设施初始化失败',
      );
      expect(usersService.remove).toHaveBeenCalledWith(
        'user-1',
        'tenant-large-1',
      );
      expect(mockRepository.purge).toHaveBeenCalledWith('tenant-large-1');
    });
  });

  describe('remove', () => {
    it('should soft delete tenant and invalidate cache', async () => {
      const mockTenant = {
        id: 'tenant-1',
        tenantId: 'acme',
        displayName: 'ACME',
        status: TenantStatus.ACTIVE,
        isolationLevel: 'small',
        dbConfig: null,
        vikingAccount: null,
        quota: null,
        ovConfig: null,
        description: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      } as unknown as Tenant;

      mockRepository.findById.mockResolvedValueOnce(mockTenant);

      await service.remove('tenant-1', { id: 'admin-1', username: 'admin' });

      expect(mockRepository.delete).toHaveBeenCalledWith('tenant-1');
      expect(tenantCache.invalidate).toHaveBeenCalledWith('acme');
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'delete_tenant',
          target: 'acme',
        }),
      );
    });
  });
});
