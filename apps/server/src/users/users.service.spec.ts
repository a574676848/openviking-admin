import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { USER_REPOSITORY } from './domain/repositories/user.repository.interface';
import type { IUserRepository } from './domain/repositories/user.repository.interface';
import { UsersService } from './users.service';
import { Tenant } from '../tenant/entities/tenant.entity';
import { TenantIsolationLevel } from '../common/constants/system.enum';

function createTenant(overrides: Partial<Tenant> = {}): Tenant {
  return {
    id: 'tenant-record-1',
    tenantId: 'mem',
    displayName: 'Memory',
    status: 'active',
    isolationLevel: TenantIsolationLevel.SMALL,
    dbConfig: null,
    vikingAccount: '',
    quota: null,
    ovConfig: null,
    description: '',
    createdAt: new Date('2026-05-15T00:00:00.000Z'),
    updatedAt: new Date('2026-05-15T00:00:00.000Z'),
    deletedAt: null,
    ...overrides,
  };
}

describe('UsersService', () => {
  let service: UsersService;
  let userRepo: jest.Mocked<IUserRepository>;
  let tenantRepo: jest.Mocked<Pick<Repository<Tenant>, 'findOne'>>;

  beforeEach(async () => {
    userRepo = {
      findAll: jest.fn(),
      findById: jest.fn(),
      findByUsername: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
      find: jest.fn(),
    };
    tenantRepo = {
      findOne: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: USER_REPOSITORY, useValue: userRepo },
        { provide: getRepositoryToken(Tenant), useValue: tenantRepo },
      ],
    }).compile();

    service = moduleRef.get(UsersService);
  });

  it('应该先按租户标识解析到租户记录 ID 再查询成员列表', async () => {
    tenantRepo.findOne.mockResolvedValue(createTenant());
    userRepo.findAll.mockResolvedValue([]);

    await service.findAll('mem');

    expect(tenantRepo.findOne).toHaveBeenCalledWith({
      where: { tenantId: 'mem' },
    });
    expect(userRepo.findAll).toHaveBeenCalledWith('tenant-record-1');
  });

  it('tenantScope 是 UUID 时应该同时支持按租户记录 ID 和租户标识解析', async () => {
    tenantRepo.findOne.mockResolvedValue(createTenant({
      id: '4de41489-ffd3-4148-8d55-15610ad1673a',
      tenantId: 'mem',
    }));
    userRepo.findAll.mockResolvedValue([]);

    await service.findAll('4de41489-ffd3-4148-8d55-15610ad1673a');

    expect(tenantRepo.findOne).toHaveBeenCalledWith({
      where: [
        { id: '4de41489-ffd3-4148-8d55-15610ad1673a' },
        { tenantId: '4de41489-ffd3-4148-8d55-15610ad1673a' },
      ],
    });
    expect(userRepo.findAll).toHaveBeenCalledWith(
      '4de41489-ffd3-4148-8d55-15610ad1673a',
    );
  });

  it('应该在创建成员时把租户标识转成租户记录 ID 再落库', async () => {
    tenantRepo.findOne.mockResolvedValue(createTenant());
    userRepo.findByUsername.mockResolvedValue(null);
    userRepo.create.mockImplementation((input) => input as never);
    userRepo.save.mockResolvedValue({
      id: 'user-1',
      username: 'alice',
      passwordHash: 'hashed',
      role: 'tenant_viewer',
      tenantId: 'tenant-record-1',
      active: true,
      ssoId: null,
      provider: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await service.create({
      username: 'alice',
      password: 'secret123',
      role: 'tenant_viewer',
      tenantId: 'mem',
    });

    expect(userRepo.findByUsername).toHaveBeenCalledWith(
      'alice',
      'tenant-record-1',
    );
    expect(userRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-record-1',
      }),
    );
  });
});
