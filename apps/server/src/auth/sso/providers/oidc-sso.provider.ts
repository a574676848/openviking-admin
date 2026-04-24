import { Injectable, UnauthorizedException } from '@nestjs/common';
import { Integration } from '../../../tenant/entities/integration.entity';

@Injectable()
export class OidcSsoProvider {
  async authenticate(config: Integration, payload: any) {
    const { issuer, clientId, clientSecret } = config.credentials;
    const { code, redirectUri } = payload;

    if (!code) throw new UnauthorizedException('OIDC 授权码缺失');

    // 换取 token (标准 OIDC 流程)
    const tokenUrl = `${issuer.replace(/\/$/, '')}/protocol/openid-connect/token`; // 以 Keycloak 为例

    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    });

    const tokenRes = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (!tokenRes.ok)
      throw new UnauthorizedException('OIDC 认证失败，授权码无效');
    const data = await tokenRes.json();

    // 获取用户信息
    const userInfoUrl = `${issuer.replace(/\/$/, '')}/protocol/openid-connect/userinfo`;
    const userRes = await fetch(userInfoUrl, {
      headers: { Authorization: `Bearer ${data.access_token}` },
    });

    if (!userRes.ok) throw new UnauthorizedException('OIDC 获取用户信息失败');
    const userData = await userRes.json();

    return {
      ssoId: userData.sub,
      username: userData.preferred_username || userData.email || userData.sub,
      displayName: userData.name || userData.given_name || 'OIDC 用户',
    };
  }
}
