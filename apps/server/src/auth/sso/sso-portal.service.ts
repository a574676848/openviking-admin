import { Injectable, UnauthorizedException } from '@nestjs/common';
import { IntegrationService } from '../../tenant/integration.service';
import { IntegrationType } from '../../common/constants/system.enum';
import { UsersService } from '../../users/users.service';
import { LdapProvider } from './providers/ldap.provider';
import { FeishuSsoProvider } from './providers/feishu-sso.provider';
import { OidcSsoProvider } from './providers/oidc-sso.provider';
import { DingTalkSsoProvider } from './providers/dingtalk-sso.provider';

@Injectable()
export class SSOPortalService {
  constructor(
    private integrationService: IntegrationService,
    private usersService: UsersService,
    private ldap: LdapProvider,
    private feishu: FeishuSsoProvider,
    private oidc: OidcSsoProvider,
    private dingtalk: DingTalkSsoProvider,
  ) {}

  /**
   * 统一身份验证分发
   */
  async authenticate(tenantId: string, type: IntegrationType, payload: any) {
    const integrations = await this.integrationService.findAll(tenantId);
    const config = integrations.find((i) => i.type === type && i.active);

    if (!config) throw new UnauthorizedException('该租户尚未开启相关企业集成');

    let ssoUser;

    // 根据类型路由到不同的 Provider
    if (type === IntegrationType.LDAP) {
      ssoUser = await this.ldap.authenticate(config, payload);
    } else if (type === IntegrationType.FEISHU) {
      ssoUser = await this.feishu.authenticate(config, payload);
    } else if (type === IntegrationType.OIDC) {
      ssoUser = await this.oidc.authenticate(config, payload);
    } else if (type === IntegrationType.DINGTALK) {
      ssoUser = await this.dingtalk.authenticate(config, payload);
    } else {
      throw new Error(`认证协议适配器 ${type} 尚未实现`);
    }

    // 统一处理用户同步 (JIT Provisioning)
    return this.syncUser(ssoUser, tenantId, type);
  }

  private async syncUser(ssoUser: any, tenantId: string, provider: string) {
    const users = await this.usersService.findAll(tenantId);
    let user = users.find(
      (u) => u.ssoId === ssoUser.ssoId && u.provider === provider,
    );

    if (!user) {
      const created = await this.usersService.create({
        username: ssoUser.username,
        displayName: ssoUser.displayName,
        role: 'tenant_viewer',
        ssoId: ssoUser.ssoId,
        provider,
        tenantId,
      } as any);
      user = Array.isArray(created) ? created[0] : created;
    }
    return user;
  }
}
