import { Injectable } from '@nestjs/common';
import {
  IPlatformIntegrator,
  PlatformInjectConfig,
} from './platform-integrator.interface';
import { Integration } from '../../tenant/entities/integration.entity';
import { PLATFORM_ENDPOINTS } from '../constants';
import type { DingTalkTokenResponse } from '../../common/external-api.types';

@Injectable()
export class DingTalkIntegrator implements IPlatformIntegrator {
  supports(type: string): boolean {
    return type === 'dingtalk';
  }

  async resolveConfig(
    integration: Integration,
    sourceUrl: string,
  ): Promise<PlatformInjectConfig> {
    const { appId, appSecret } = integration.credentials;

    const res = await fetch(
      `${PLATFORM_ENDPOINTS.DINGTALK.AUTH_URL}?appkey=${appId}&appsecret=${appSecret}`,
    );
    const data = (await res.json()) as DingTalkTokenResponse;

    if (data.errcode !== 0) throw new Error(`钉钉鉴权失败: ${data.errmsg}`);

    return {
      path: sourceUrl,
      config: {
        dingtalk_token: data.access_token,
        source_type: PLATFORM_ENDPOINTS.DINGTALK.SOURCE_TYPE,
      },
    };
  }
}
