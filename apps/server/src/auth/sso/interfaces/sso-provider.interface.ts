import { Integration } from '../../../tenant/entities/integration.entity';

/** 统一 SSO 用户信息结构 */
export interface SSOUser {
  ssoId: string;
  username: string;
  email?: string;
  displayName?: string;
  raw?: any;
}

export interface ISSOProvider {
  /** 获取重定向登录 URL (针对 OAuth2/OIDC 类型) */
  getRedirectUrl?(integration: Integration): Promise<string>;

  /** 执行身份验证并获取用户信息 (针对回调或 LDAP 直接验证) */
  authenticate(integration: Integration, payload: any): Promise<SSOUser>;
}
