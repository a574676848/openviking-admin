import { Injectable, UnauthorizedException } from '@nestjs/common';
import { Integration } from '../../../tenant/entities/integration.entity';
import type {
  DingTalkTokenResponse,
  DingTalkUserResponse,
} from '../../../common/external-api.types';

@Injectable()
export class DingTalkSsoProvider {
  async authenticate(config: Integration, payload: { code?: string }) {
    const { appId, appSecret } = config.credentials;
    const { code } = payload;

    if (!code) throw new UnauthorizedException('钉钉授权码缺失');

    const tokenRes = await fetch(
      `https://oapi.dingtalk.com/gettoken?appkey=${appId}&appsecret=${appSecret}`,
    );
    const tokenData = (await tokenRes.json()) as DingTalkTokenResponse;
    if (tokenData.errcode !== 0)
      throw new UnauthorizedException('钉钉获取 Token 失败');

    const userRes = await fetch(
      `https://oapi.dingtalk.com/topapi/v2/user/getuserinfo`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          access_token: tokenData.access_token,
          code,
        }),
      },
    );

    const userData = (await userRes.json()) as DingTalkUserResponse;
    if (userData.errcode !== 0)
      throw new UnauthorizedException('钉钉获取用户信息失败');

    return {
      ssoId: userData.result.userid,
      username: userData.result.name,
      displayName: userData.result.name,
    };
  }
}
