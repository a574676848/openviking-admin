import { UnauthorizedException } from '@nestjs/common';
import { LdapProvider } from './ldap.provider';
import { SystemRoles } from '../../../users/entities/user.entity';
import type { Integration } from '../../../tenant/entities/integration.entity';

const bindMock = jest.fn();
const searchMock = jest.fn();
const unbindMock = jest.fn();

function createIntegration(credentials: Record<string, unknown>): Integration {
  return { credentials } as unknown as Integration;
}

jest.mock('ldapts', () => ({
  Client: jest.fn().mockImplementation(() => ({
    bind: bindMock,
    search: searchMock,
    unbind: unbindMock,
  })),
}));

describe('LdapProvider', () => {
  const provider = new LdapProvider();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('应使用服务账号搜索用户并按 AD 组映射项目角色', async () => {
    searchMock.mockResolvedValue({
      searchEntries: [
        {
          dn: 'CN=张三,OU=Users,DC=corp,DC=local',
          objectGUID: Buffer.from('user-guid'),
          sAMAccountName: 'zhangsan',
          displayName: '张三',
          mail: 'zhangsan@corp.local',
          memberOf: ['CN=openviking-admins,OU=Groups,DC=corp,DC=local'],
        },
      ],
    });

    const result = await provider.authenticate(
      createIntegration({
        url: 'ldap://ad.corp.local:389',
        baseDN: 'DC=corp,DC=local',
        bindDN: 'CN=ldap-reader,OU=Service Accounts,DC=corp,DC=local',
        bindPassword: 'reader-password',
        roleMappings: JSON.stringify({
          'CN=openviking-admins,OU=Groups,DC=corp,DC=local':
            SystemRoles.TENANT_ADMIN,
        }),
      }),
      { username: 'zhangsan', password: 'user-password' },
    );

    expect(bindMock).toHaveBeenNthCalledWith(
      1,
      'CN=ldap-reader,OU=Service Accounts,DC=corp,DC=local',
      'reader-password',
    );
    expect(bindMock).toHaveBeenNthCalledWith(
      2,
      'CN=张三,OU=Users,DC=corp,DC=local',
      'user-password',
    );
    expect(result).toMatchObject({
      username: 'zhangsan',
      role: SystemRoles.TENANT_ADMIN,
      email: 'zhangsan@corp.local',
      displayName: '张三',
    });
    expect(result.ssoId).toBe(
      `ldap:${Buffer.from('user-guid').toString('hex')}`,
    );
  });

  it('未找到唯一用户时应拒绝登录', async () => {
    searchMock.mockResolvedValue({ searchEntries: [] });

    await expect(
      provider.authenticate(
        createIntegration({
          url: 'ldap://ad.corp.local:389',
          baseDN: 'DC=corp,DC=local',
          bindDN: 'CN=ldap-reader,DC=corp,DC=local',
          bindPassword: 'reader-password',
        }),
        { username: 'missing', password: 'user-password' },
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
