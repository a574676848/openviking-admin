import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  Optional,
} from '@nestjs/common';
import Redis from 'ioredis';
import {
  DOCUMENT_ASSET_DEDUP_STORE_OPTIONS,
  type DocumentAssetDedupEntry,
  type DocumentAssetDedupStore,
  type DocumentAssetDedupStoreOptions,
} from './document-asset-dedup.store';

interface RedisLikeClient {
  get(key: string): Promise<string | null>;
  set(
    key: string,
    value: string,
    mode: 'EX',
    ttlSeconds: number,
  ): Promise<unknown>;
  quit(): Promise<unknown>;
  disconnect(): void;
  on?(event: 'error', listener: (error: Error) => void): RedisLikeClient;
}

@Injectable()
export class RedisDocumentAssetDedupStore
  implements DocumentAssetDedupStore, OnModuleDestroy
{
  private readonly logger = new Logger(RedisDocumentAssetDedupStore.name);
  private readonly options: DocumentAssetDedupStoreOptions;
  private _client?: RedisLikeClient;

  constructor(
    @Inject(DOCUMENT_ASSET_DEDUP_STORE_OPTIONS)
    options: DocumentAssetDedupStoreOptions,
    @Optional()
    client?: RedisLikeClient,
  ) {
    this.options = options;
    this._client = client;
  }

  private get client(): RedisLikeClient {
    if (!this._client) {
      const newClient = this.createClient(this.options);
      newClient.on?.('error', (err: Error) => {
        this.logger.warn(`Redis 文档资产去重缓存连接错误: ${err.message}`);
      });
      this._client = newClient;
    }
    return this._client;
  }

  async get(nodeId: string, hash: string): Promise<string | null> {
    return this.client.get(this.buildHashKey(nodeId, hash));
  }

  async set(nodeId: string, hash: string, assetPath: string): Promise<void> {
    await this.client.set(
      this.buildHashKey(nodeId, hash),
      assetPath,
      'EX',
      this.options.ttlSeconds,
    );
  }

  async getAll(nodeId: string): Promise<DocumentAssetDedupEntry[]> {
    const raw = await this.client.get(this.buildIndexKey(nodeId));
    if (!raw) {
      return [];
    }

    try {
      const parsed = JSON.parse(raw) as DocumentAssetDedupEntry[];
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed.filter(
        (entry) =>
          typeof entry?.hash === 'string' && typeof entry?.assetPath === 'string',
      );
    } catch {
      return [];
    }
  }

  async replaceAll(
    nodeId: string,
    entries: DocumentAssetDedupEntry[],
  ): Promise<void> {
    await this.client.set(
      this.buildIndexKey(nodeId),
      JSON.stringify(entries),
      'EX',
      this.options.ttlSeconds,
    );
    for (const entry of entries) {
      await this.set(nodeId, entry.hash, entry.assetPath);
    }
  }

  async onModuleDestroy() {
    if (!this._client) {
      return;
    }
    try {
      await this._client.quit();
    } catch (error) {
      this.logger.warn(
        `redis 文档资产去重缓存 quit 失败: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
      this._client.disconnect();
    }
  }

  private buildHashKey(nodeId: string, hash: string): string {
    return `${this.options.redisKeyPrefix}:node:${nodeId}:hash:${hash}`;
  }

  private buildIndexKey(nodeId: string): string {
    return `${this.options.redisKeyPrefix}:node:${nodeId}:index`;
  }

  private createClient(options: DocumentAssetDedupStoreOptions) {
    if (options.redisUrl) {
      const url = options.redisPassword
        ? this.injectPasswordIntoRedisUrl(options.redisUrl, options.redisPassword)
        : options.redisUrl;
      return new Redis(url, {
        connectTimeout: options.redisConnectTimeoutMs,
        tls: options.redisTls ? {} : undefined,
      }) as unknown as RedisLikeClient;
    }

    const redisOptions: Record<string, unknown> = {
      host: options.redisHost,
      port: options.redisPort,
      db: options.redisDb,
      connectTimeout: options.redisConnectTimeoutMs,
      tls: options.redisTls ? {} : undefined,
    };
    if (options.redisPassword) {
      redisOptions.password = options.redisPassword;
    }
    return new Redis(redisOptions) as unknown as RedisLikeClient;
  }

  private injectPasswordIntoRedisUrl(url: string, password: string): string {
    try {
      const parsed = new URL(url);
      if (!parsed.password) {
        parsed.password = encodeURIComponent(password);
        return parsed.toString();
      }
    } catch {
      // URL 解析失败时不做注入，原样返回
    }
    return url;
  }
}
