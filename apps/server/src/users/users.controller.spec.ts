import { UsersController } from './users.controller';
import { SystemRoles } from './entities/user.entity';

describe('UsersController', () => {
  const usersService = {
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    findAll: jest.fn(),
  };
  const auditService = {
    log: jest.fn(),
  };
  const controller = new UsersController(
    usersService as never,
    auditService as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('平台态创建用户时应保留表单选择的租户绑定', async () => {
    usersService.create.mockResolvedValue({ id: 'user-1' });

    await controller.create(
      {
        username: 'alice',
        password: 'secret123',
        role: SystemRoles.TENANT_VIEWER,
        tenantId: 'tenant-alpha',
      } as never,
      {
        tenantScope: null,
        user: {
          id: 'admin-1',
          username: 'admin',
          role: SystemRoles.SUPER_ADMIN,
        },
        headers: {},
        ip: '127.0.0.1',
      } as never,
    );

    expect(usersService.create).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-alpha' }),
    );
  });

  it('租户态创建用户时应强制使用当前租户上下文', async () => {
    usersService.create.mockResolvedValue({ id: 'user-2' });

    await controller.create(
      {
        username: 'bob',
        password: 'secret123',
        role: SystemRoles.TENANT_VIEWER,
        tenantId: 'tenant-beta',
      } as never,
      {
        tenantScope: 'tenant-alpha',
        user: {
          id: 'tenant-admin-1',
          username: 'tenant-admin',
          role: SystemRoles.TENANT_ADMIN,
        },
        headers: {},
        ip: '127.0.0.1',
      } as never,
    );

    expect(usersService.create).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-alpha' }),
    );
  });
});
