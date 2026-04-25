import { Injectable, UnauthorizedException } from '@nestjs/common';
import { Integration } from '../../../tenant/entities/integration.entity';
import type { FeishuTokenResponse } from '../../../common/external-api.types';

@Injectable()
export class FeishuSsoProvider {
  async authenticate(config: Integration, payload: { code?: string }) {
    const { code } = payload;
    if (!code) throw new UnauthorizedException('飞书授权码缺失');

    const tokenRes = await fetch(
      'https://open.feishu.cn/open-apis/authen/v1/access_token',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          app_access_token: 'mock_token',
          grant_type: 'authorization_code',
          code,
        }),
      },
    );

    if (!tokenRes.ok) throw new UnauthorizedException('飞书认证失败');
    const data = (await tokenRes.json()) as FeishuTokenResponse;

    return {
      ssoId: data.data.open_id || 'feishu_mock_id',
      username: data.data.name || 'feishu_user',
      displayName: data.data.name || '飞书用户',
    };
  }
}
