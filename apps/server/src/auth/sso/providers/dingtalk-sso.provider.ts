import { Injectable, UnauthorizedException } from '@nestjs/common';
import { Integration } from '../../../tenant/entities/integration.entity';

@Injectable()
export class DingTalkSsoProvider {
  async authenticate(config: Integration, payload: any) {
    const { appId, appSecret } = config.credentials;
    const { code } = payload;

    if (!code) throw new UnauthorizedException('钉钉授权码缺失');

    // 获取企业内部应用的 access_token
    const tokenRes = await fetch(
      `https://oapi.dingtalk.com/gettoken?appkey=${appId}&appsecret=${appSecret}`,
    );
    const tokenData = await tokenRes.json();
    if (tokenData.errcode !== 0)
      throw new UnauthorizedException('钉钉获取 Token 失败');

    // 通过免登授权码获取用户信息
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

    const userData = await userRes.json();
    if (userData.errcode !== 0)
      throw new UnauthorizedException('钉钉获取用户信息失败');

    return {
      ssoId: userData.result.userid,
      username: userData.result.name,
      displayName: userData.result.name,
    };
  }
}
