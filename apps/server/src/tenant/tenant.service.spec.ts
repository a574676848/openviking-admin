import { Test, TestingModule } from '@nestjs/testing';
import { TenantService } from './tenant.service';
import { TENANT_REPOSITORY } from './domain/repositories/tenant.repository.interface';
import type { ITenantRepository } from './domain/repositories/tenant.repository.interface';
import { AuditService } from '../audit/audit.service';
import { SchemaInitializerService } from './schema-initializer.service';
import { TenantCacheService } from './tenant-cache.service';
import { Tenant } from './entities/tenant.entity';
import { EncryptionService } from '../common/encryption.service';

describe('TenantService', () => {
  let service: TenantService;
  let mockRepository: jest.Mocked<ITenantRepository>;

  beforeEach(async () => {
    mockRepository = {
      findAll: jest.fn(),
      findById: jest.fn(),
      findByTenantId: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantService,
        { provide: TENANT_REPOSITORY, useValue: mockRepository },
        { provide: AuditService, useValue: { log: jest.fn() } },
        {
          provide: SchemaInitializerService,
          useValue: { initialize: jest.fn() },
        },
        { provide: TenantCacheService, useValue: { invalidate: jest.fn() } },
        {
          provide: EncryptionService,
          useValue: { encrypt: jest.fn(), decrypt: jest.fn() },
        },
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
});
