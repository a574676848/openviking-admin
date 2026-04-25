import { Injectable, Logger } from '@nestjs/common';

export interface OVConnection {
  baseUrl: string;
  apiKey?: string;
  account?: string;
}

@Injectable()
export class OVClientService {
  private readonly logger = new Logger(OVClientService.name);

  async request(
    conn: OVConnection,
    path: string,
    method: string = 'GET',
    body?: Record<string, unknown>,
  ) {
    const url = `${conn.baseUrl}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-api-key': conn.apiKey || '',
      'X-OpenViking-Account': conn.account || 'default',
    };

    try {
      const res = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!res.ok) {
        const errorText = await res.text();
        this.logger.error(`OpenViking API Error [${res.status}]: ${errorText}`);
        throw new Error(`底层引擎响应异常 [${res.status}]`);
      }

      return (await res.json()) as Record<string, unknown>;
    } catch (e) {
      const message = e instanceof Error ? e.message : '未知错误';
      this.logger.error(`Failed to connect to OpenViking: ${message}`);
      throw e;
    }
  }

  async getHealth(baseUrl: string) {
    try {
      const res = await fetch(`${baseUrl}/health`);
      return (await res.json()) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}
