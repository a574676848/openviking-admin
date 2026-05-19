import { Injectable, UnauthorizedException } from '@nestjs/common';
import { IntegrationService } from '../../tenant/integration.service';
import { IntegrationType } from '../../common/constants/system.enum';
import { UsersService } from '../../users/users.service';
import type { UserModel } from '../../users/domain/user.model';
import { LdapProvider } from './providers/ldap.provider';
import { FeishuSsoProvider } from './providers/feishu-sso.provider';
import { OidcSsoProvider } from './providers/oidc-sso.provider';
import { DingTalkSsoProvider } from './providers/dingtalk-sso.provider';
import { SystemRoles } from '../../users/entities/user.entity';
import type { UserRole } from '../../users/entities/user.entity';

interface SSOUserResult {
  ssoId: string;
  username: string;
  role?: UserRole;
  displayName?: string;
}

interface AuthorizationUrlInput {
  tenantId: string;
  type: IntegrationType;
  callbackUrl: string;
  state?: string;
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
    const config = await this.integrationService.findActiveByType(
      tenantId,
      type,
    );

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

  async createAuthorizationUrl(input: AuthorizationUrlInput) {
    const config = await this.integrationService.findActiveByType(
      input.tenantId,
      input.type,
    );

    if (!config) throw new UnauthorizedException('该租户尚未开启相关企业集成');

    if (input.type === IntegrationType.FEISHU) {
      return this.buildFeishuAuthorizationUrl(config, input);
    }

    if (input.type === IntegrationType.DINGTALK) {
      return this.buildDingTalkAuthorizationUrl(config, input);
    }

    if (input.type === IntegrationType.OIDC) {
      return this.buildOidcAuthorizationUrl(config, input);
    }

    throw new Error(`认证协议适配器 ${input.type} 不支持浏览器授权跳转`);
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
        role: ssoUser.role ?? SystemRoles.TENANT_VIEWER,
        ssoId: ssoUser.ssoId,
        provider,
        tenantId,
        password: '',
      } as Parameters<UsersService['create']>[0]);
      user = (Array.isArray(created) ? created[0] : created) as UserModel;
    }
    return user;
  }

  private buildFeishuAuthorizationUrl(
    config: Awaited<ReturnType<IntegrationService['findActiveByType']>>,
    input: AuthorizationUrlInput,
  ) {
    const appId = config?.credentials?.appId ?? '';
    const url = new URL('https://open.feishu.cn/open-apis/authen/v1/authorize');
    url.searchParams.set('app_id', appId);
    url.searchParams.set('redirect_uri', input.callbackUrl);
    if (input.state) {
      url.searchParams.set('state', input.state);
    }
    return url.toString();
  }

  private buildDingTalkAuthorizationUrl(
    config: Awaited<ReturnType<IntegrationService['findActiveByType']>>,
    input: AuthorizationUrlInput,
  ) {
    const appId = config?.credentials?.appId ?? '';
    const url = new URL('https://login.dingtalk.com/oauth2/auth');
    url.searchParams.set('redirect_uri', input.callbackUrl);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', appId);
    url.searchParams.set('scope', 'openid');
    url.searchParams.set('prompt', 'consent');
    if (input.state) {
      url.searchParams.set('state', input.state);
    }
    return url.toString();
  }

  private buildOidcAuthorizationUrl(
    config: Awaited<ReturnType<IntegrationService['findActiveByType']>>,
    input: AuthorizationUrlInput,
  ) {
    const issuer = (config?.credentials?.issuer ?? '').replace(/\/$/, '');
    const clientId = config?.credentials?.clientId ?? '';
    const url = new URL(`${issuer}/protocol/openid-connect/auth`);
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', input.callbackUrl);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'openid profile email');
    if (input.state) {
      url.searchParams.set('state', input.state);
    }
    return url.toString();
  }
}
