import { Injectable } from '@nestjs/common';
import {
  IPlatformIntegrator,
  PlatformInjectConfig,
} from './platform-integrator.interface';
import { Integration } from '../../tenant/entities/integration.entity';
import { PLATFORM_ENDPOINTS } from '../constants';

@Injectable()
export class FeishuIntegrator implements IPlatformIntegrator {
  supports(type: string): boolean {
    return type === 'feishu';
  }

  async resolveConfig(
    integration: Integration,
    sourceUrl: string,
  ): Promise<PlatformInjectConfig> {
    const { appId, appSecret } = integration.credentials;

    const res = await fetch(PLATFORM_ENDPOINTS.FEISHU.AUTH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(`飞书鉴权失败: ${data.msg}`);

    return {
      path: sourceUrl,
      config: {
        feishu_token: data.tenant_access_token,
        source_type: PLATFORM_ENDPOINTS.FEISHU.SOURCE_TYPE,
      },
    };
  }
}
