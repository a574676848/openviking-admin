import { Injectable } from '@nestjs/common';
import {
  IPlatformIntegrator,
  PlatformInjectConfig,
} from './platform-integrator.interface';
import { Integration } from '../../tenant/entities/integration.entity';
import { PLATFORM_ENDPOINTS } from '../constants';
import type {
  FeishuAppTokenResponse,
  FeishuDocxInfoResponse,
  FeishuDocxRawContentResponse,
} from '../../common/external-api.types';
import { createMarkdownTempFile } from './platform-document.util';

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
    const docToken = this.extractDocToken(sourceUrl);
    const tenantAccessToken = await this.fetchTenantAccessToken(appId, appSecret);
    const info = await this.fetchDocumentInfo(docToken, tenantAccessToken);
    const content = await this.fetchRawContent(docToken, tenantAccessToken);

    return {
      tempFile: createMarkdownTempFile({
        title: info.title,
        content,
        fallbackName: docToken,
        sourceUrl,
      }),
    };
  }

  private async fetchTenantAccessToken(appId: string, appSecret: string) {
    const res = await fetch(PLATFORM_ENDPOINTS.FEISHU.AUTH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
    });

    const data = (await res.json()) as FeishuAppTokenResponse;
    if (!res.ok || data.code !== 0) throw new Error(`飞书鉴权失败: ${data.msg}`);
    return data.tenant_access_token;
  }

  private async fetchDocumentInfo(docToken: string, tenantAccessToken: string) {
    const data = await this.fetchFeishu<FeishuDocxInfoResponse>(
      `${PLATFORM_ENDPOINTS.FEISHU.DOCX_API_BASE}/${docToken}`,
      tenantAccessToken,
    );
    return {
      title: data.data?.document?.title?.trim() || docToken,
    };
  }

  private async fetchRawContent(docToken: string, tenantAccessToken: string) {
    const data = await this.fetchFeishu<FeishuDocxRawContentResponse>(
      `${PLATFORM_ENDPOINTS.FEISHU.DOCX_API_BASE}/${docToken}/raw_content`,
      tenantAccessToken,
    );
    const content = data.data?.content?.trim();
    if (!content) {
      throw new Error('飞书文档内容为空或无权读取');
    }
    return content;
  }

  private async fetchFeishu<T extends { code: number; msg: string }>(
    url: string,
    tenantAccessToken: string,
  ) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${tenantAccessToken}` },
    });
    const data = (await res.json()) as T;
    if (!res.ok || data.code !== 0) {
      throw new Error(`飞书文档读取失败: ${data.msg}`);
    }
    return data;
  }

  private extractDocToken(sourceUrl: string) {
    const match = new URL(sourceUrl).pathname.match(
      PLATFORM_ENDPOINTS.FEISHU.DOCX_TOKEN_PATTERN,
    );
    if (!match?.[1]) {
      throw new Error('飞书文档地址缺少 docx token');
    }
    return match[1];
  }
}
