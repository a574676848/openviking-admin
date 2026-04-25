import { Injectable, UnauthorizedException } from '@nestjs/common';
import { Integration } from '../../../tenant/entities/integration.entity';
import type {
  OidcTokenResponse,
  OidcUserResponse,
} from '../../../common/external-api.types';

@Injectable()
export class OidcSsoProvider {
  async authenticate(
    config: Integration,
    payload: { code?: string; redirectUri?: string },
  ) {
    const { issuer, clientId, clientSecret } = config.credentials;
    const { code, redirectUri } = payload;

    if (!code) throw new UnauthorizedException('OIDC 授权码缺失');

    const tokenUrl = `${(issuer ?? '').replace(/\/$/, '')}/protocol/openid-connect/token`;

    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId ?? '',
      client_secret: clientSecret ?? '',
      code,
      redirect_uri: redirectUri ?? '',
    });

    const tokenRes = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (!tokenRes.ok)
      throw new UnauthorizedException('OIDC 认证失败，授权码无效');
    const data = (await tokenRes.json()) as OidcTokenResponse;

    const userInfoUrl = `${(issuer ?? '').replace(/\/$/, '')}/protocol/openid-connect/userinfo`;
    const userRes = await fetch(userInfoUrl, {
      headers: { Authorization: `Bearer ${data.access_token}` },
    });

    if (!userRes.ok) throw new UnauthorizedException('OIDC 获取用户信息失败');
    const userData = (await userRes.json()) as OidcUserResponse;

    return {
      ssoId: userData.sub,
      username: userData.preferred_username || userData.email || userData.sub,
      displayName: userData.name || userData.given_name || 'OIDC 用户',
    };
  }
}
