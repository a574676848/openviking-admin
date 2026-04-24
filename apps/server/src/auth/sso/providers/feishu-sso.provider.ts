import { Injectable, UnauthorizedException } from '@nestjs/common';
import { Integration } from '../../../tenant/entities/integration.entity';

@Injectable()
export class FeishuSsoProvider {
  async authenticate(config: Integration, payload: any) {
    const { appId, appSecret } = config.credentials;
    const { code } = payload;
    if (!code) throw new UnauthorizedException('飞书授权码缺失');

    // 换取 user_access_token (模拟实现或真实实现)
    const tokenRes = await fetch(
      'https://open.feishu.cn/open-apis/authen/v1/access_token',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          app_access_token: 'mock_token', // 在真实生产中需先获取 app_access_token
          grant_type: 'authorization_code',
          code,
        }),
      },
    );

    if (!tokenRes.ok) throw new UnauthorizedException('飞书认证失败');
    const data = await tokenRes.json();

    return {
      ssoId: data.data.open_id || 'feishu_mock_id',
      username: data.data.name || 'feishu_user',
      displayName: data.data.name || '飞书用户',
    };
  }
}
