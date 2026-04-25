/** 外部 SSO / 集成平台 API 通用响应类型 */

export interface DingTalkTokenResponse {
  errcode: number;
  errmsg: string;
  access_token: string;
}

export interface DingTalkUserResponse {
  errcode: number;
  errmsg: string;
  result: {
    userid: string;
    name: string;
  };
}

export interface FeishuTokenResponse {
  code: number;
  msg: string;
  data: {
    open_id?: string;
    name?: string;
  };
}

export interface FeishuAppTokenResponse {
  code: number;
  msg: string;
  tenant_access_token: string;
}

export interface OidcTokenResponse {
  access_token: string;
  token_type: string;
}

export interface OidcUserResponse {
  sub: string;
  preferred_username?: string;
  email?: string;
  name?: string;
  given_name?: string;
}

export interface PlatformInjectConfig {
  path: string;
  config: Record<string, unknown>;
}
