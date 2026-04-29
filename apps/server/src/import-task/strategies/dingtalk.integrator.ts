import { Injectable } from '@nestjs/common';
import {
  IPlatformIntegrator,
  PlatformInjectConfig,
} from './platform-integrator.interface';
import { Integration } from '../../tenant/entities/integration.entity';
import { PLATFORM_ENDPOINTS } from '../constants';
import type {
  DingTalkAppTokenResponse,
  DingTalkWikiNodeByUrlResponse,
} from '../../common/external-api.types';
import { createMarkdownTempFile } from './platform-document.util';

@Injectable()
export class DingTalkIntegrator implements IPlatformIntegrator {
  supports(type: string): boolean {
    return type === 'dingtalk';
  }

  async resolveConfig(
    integration: Integration,
    sourceUrl: string,
  ): Promise<PlatformInjectConfig> {
    const operatorId = this.resolveOperatorId(integration);
    const accessToken = await this.fetchAccessToken(integration);
    const node = await this.fetchNodeByUrl(sourceUrl, operatorId, accessToken);
    const content = await this.fetchDocumentBlocks(
      node.documentId,
      operatorId,
      accessToken,
    );

    return {
      tempFile: createMarkdownTempFile({
        title: node.title,
        content,
        fallbackName: node.documentId,
        sourceUrl,
      }),
    };
  }

  private async fetchAccessToken(integration: Integration) {
    const { appId, appSecret } = integration.credentials;
    if (!appId || !appSecret) {
      throw new Error('钉钉集成缺少 appId 或 appSecret');
    }

    const res = await fetch(PLATFORM_ENDPOINTS.DINGTALK.AUTH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appKey: appId, appSecret }),
    });
    const data = (await res.json()) as DingTalkAppTokenResponse;
    if (!res.ok || !data.accessToken) {
      throw new Error(`钉钉鉴权失败: ${data.message ?? '未知错误'}`);
    }
    return data.accessToken;
  }

  private async fetchNodeByUrl(
    sourceUrl: string,
    operatorId: string,
    accessToken: string,
  ) {
    const url = `${PLATFORM_ENDPOINTS.DINGTALK.QUERY_BY_URL_URL}?operatorId=${encodeURIComponent(operatorId)}`;
    const data = await this.postDingTalk<DingTalkWikiNodeByUrlResponse>(
      url,
      {
        url: sourceUrl,
        option: {
          withStatisticalInfo: false,
          withPermissionRole: false,
        },
      },
      accessToken,
    );
    const documentId = data.node?.uuid ?? data.node?.nodeId;
    if (!documentId) {
      throw new Error('钉钉文档链接未解析到 documentId');
    }
    return {
      documentId,
      title: data.node?.name?.trim() || documentId,
    };
  }

  private async fetchDocumentBlocks(
    documentId: string,
    operatorId: string,
    accessToken: string,
  ) {
    const url = `${PLATFORM_ENDPOINTS.DINGTALK.DOCUMENT_BLOCKS_URL}/${encodeURIComponent(documentId)}/blocks/query`;
    const data = await this.postDingTalk<unknown>(
      url,
      {
        startIndex: 0,
        endIndex: 9999,
        operatorId,
      },
      accessToken,
    );
    const content = this.extractReadableContent(data);
    if (!content) {
      throw new Error('钉钉文档内容为空或无权读取');
    }
    return content;
  }

  private async postDingTalk<T>(
    url: string,
    body: Record<string, unknown>,
    accessToken: string,
  ) {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-acs-dingtalk-access-token': accessToken,
      },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as T & {
      code?: string;
      message?: string;
    };
    if (!res.ok || data.code) {
      throw new Error(`钉钉文档读取失败: ${data.message ?? data.code ?? '未知错误'}`);
    }
    return data;
  }

  private extractReadableContent(value: unknown): string {
    const pieces: string[] = [];
    this.collectText(value, pieces);
    return Array.from(new Set(pieces.map((item) => item.trim()).filter(Boolean)))
      .join('\n');
  }

  private collectText(value: unknown, pieces: string[]) {
    if (typeof value === 'string') {
      pieces.push(value);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => this.collectText(item, pieces));
      return;
    }
    if (!value || typeof value !== 'object') {
      return;
    }

    const record = value as Record<string, unknown>;
    ['text', 'content', 'plainText', 'value'].forEach((key) =>
      this.collectText(record[key], pieces),
    );
    Object.entries(record)
      .filter(([key]) => !['text', 'content', 'plainText', 'value'].includes(key))
      .forEach(([, item]) => this.collectText(item, pieces));
  }

  private resolveOperatorId(integration: Integration) {
    const credentials = integration.credentials as Record<string, unknown>;
    const config = integration.config as Record<string, unknown> | null;
    const value = credentials.operatorId ?? credentials.unionId ?? config?.operatorId;
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new Error('钉钉文档导入需要配置 operatorId 或 unionId');
    }
    return value.trim();
  }
}
