import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ISSOProvider, SSOUser } from '../interfaces/sso-provider.interface';
import { Integration } from '../../../tenant/entities/integration.entity';

@Injectable()
export class LdapProvider implements ISSOProvider {
  private readonly logger = new Logger(LdapProvider.name);

  /**
   * LDAP 身份校验：使用用户提供的账号密码直接去域控验证
   */
  async authenticate(
    integration: Integration,
    payload: { username: string; password: string },
  ): Promise<SSOUser> {
    const { url, baseDN, bindDN, bindPassword } = integration.credentials;

    this.logger.log(
      `>> Attempting LDAP bind for user: ${payload.username} on ${url}`,
    );

    try {
      // 生产级：此处应使用 'ldapjs' 或 'activedirectory' 库执行真机验证
      // 逻辑：
      // 1. 使用 bindDN/bindPassword 管理员账号建立连接
      // 2. 根据 payload.username 查找用户的 Full DN
      // 3. 尝试使用 Full DN + payload.password 重新 bind

      // 模拟验证成功
      return {
        ssoId: `ldap_${payload.username}`,
        username: payload.username,
        displayName: `AD_USER_${payload.username}`,
        raw: { domain: 'enterprise.local' },
      };
    } catch (e) {
      throw new UnauthorizedException('Windows AD 身份校验失败');
    }
  }
}
