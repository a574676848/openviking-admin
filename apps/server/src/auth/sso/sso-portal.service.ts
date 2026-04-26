import { Injectable, UnauthorizedException } from '@nestjs/common';
import { IntegrationService } from '../../tenant/integration.service';
import { IntegrationType } from '../../common/constants/system.enum';
import { UsersService } from '../../users/users.service';
import type { UserModel } from '../../users/domain/user.model';
import { LdapProvider } from './providers/ldap.provider';
import { FeishuSsoProvider } from './providers/feishu-sso.provider';
import { OidcSsoProvider } from './providers/oidc-sso.provider';
import { DingTalkSsoProvider } from './providers/dingtalk-sso.provider';

interface SSOUserResult {
  ssoId: string;
  username: string;
  displayName?: string;
}

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

  async authenticate(
    tenantId: string,
    type: IntegrationType,
    payload: Record<string, unknown>,
  ): Promise<UserModel> {
    const integrations = await this.integrationService.findAll(tenantId);
    const config = integrations.find((i) => i.type === type && i.active);

    if (!config) throw new UnauthorizedException('该租户尚未开启相关企业集成');

    let ssoUser: SSOUserResult;

    if (type === IntegrationType.LDAP) {
      ssoUser = await this.ldap.authenticate(
        config,
        payload as { username: string; password: string },
      );
    } else if (type === IntegrationType.FEISHU) {
      ssoUser = await this.feishu.authenticate(config, payload);
    } else if (type === IntegrationType.OIDC) {
      ssoUser = await this.oidc.authenticate(config, payload);
    } else if (type === IntegrationType.DINGTALK) {
      ssoUser = await this.dingtalk.authenticate(config, payload);
    } else {
      throw new Error(`认证协议适配器 ${type} 尚未实现`);
    }

    return this.syncUser(ssoUser, tenantId, type);
  }

  private async syncUser(
    ssoUser: SSOUserResult,
    tenantId: string,
    provider: string,
  ): Promise<UserModel> {
    const users = await this.usersService.findAll(tenantId);
    let user = users.find(
      (u) => u.ssoId === ssoUser.ssoId && u.provider === provider,
    );

    if (!user) {
      const created = await this.usersService.create({
        username: ssoUser.username,
        role: 'tenant_viewer',
        ssoId: ssoUser.ssoId,
        provider,
        tenantId,
        password: '',
      } as Parameters<UsersService['create']>[0]);
      user = (Array.isArray(created) ? created[0] : created) as UserModel;
    }
    return user;
  }
}
