import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  Optional,
} from '@nestjs/common';
import Redis, { Cluster, type ClusterNode } from 'ioredis';
import {
  CAPABILITY_RATE_LIMIT_STORE_OPTIONS,
  type CapabilityRateLimitStore,
  type CapabilityRateLimitStoreOptions,
  type RateLimitBucketConsumeResult,
  type RateLimitBucketState,
} from './capability-rate-limit.store';

const RATE_LIMIT_BUCKET_HASH_FIELDS = {
  COUNT: 'count',
  WINDOW_STARTED_AT: 'windowStartedAt',
  WINDOW_MS: 'windowMs',
} as const;

const RATE_LIMIT_CLUSTER_HASH_TAG = '{capability-rate-limit}';
const REDIS_NODE_SEPARATOR = ',';
const REDIS_DEFAULT_PORT = 6379;

const RATE_LIMIT_REDIS_SCRIPT = `
local bucketKey = KEYS[1]
local registryKey = KEYS[2]
local now = tonumber(ARGV[1])
local windowMs = tonumber(ARGV[2])
local count = tonumber(redis.call('HGET', bucketKey, ARGV[3]) or '0')
local windowStartedAt = tonumber(redis.call('HGET', bucketKey, ARGV[4]) or '0')
local storedWindowMs = tonumber(redis.call('HGET', bucketKey, ARGV[5]) or '0')

if count == 0 or windowStartedAt == 0 or storedWindowMs == 0 or (now - windowStartedAt) >= storedWindowMs then
  count = 1
  windowStartedAt = now
  storedWindowMs = windowMs
  redis.call('HSET', bucketKey, ARGV[3], count, ARGV[4], windowStartedAt, ARGV[5], storedWindowMs)
  redis.call('PEXPIRE', bucketKey, storedWindowMs)
else
  count = redis.call('HINCRBY', bucketKey, ARGV[3], 1)
  local remainingWindowMs = storedWindowMs - (now - windowStartedAt)
  if remainingWindowMs < 1 then
    remainingWindowMs = 1
  end
  redis.call('PEXPIRE', bucketKey, remainingWindowMs)
end

redis.call('SADD', registryKey, bucketKey)
return { count, windowStartedAt, storedWindowMs }
`;

type RedisEvalResult = [number | string, number | string, number | string];

interface RedisPipelineResult {
  exec(): Promise<Array<[Error | null, unknown]>>;
  hmget(key: string, ...fields: string[]): RedisPipelineResult;
  pttl(key: string): RedisPipelineResult;
}

interface RedisLikeClient {
  eval(
    script: string,
    keyCount: number,
    ...args: string[]
  ): Promise<RedisEvalResult>;
  smembers(key: string): Promise<string[]>;
  pipeline(): RedisPipelineResult;
  srem(key: string, ...members: string[]): Promise<number>;
  quit(): Promise<unknown>;
  disconnect(): void;
  on?(event: 'error', listener: (error: Error) => void): RedisLikeClient;
}

type RedisClientMode = 'cluster' | 'standalone';

@Injectable()
export class RedisCapabilityRateLimitStore
  implements CapabilityRateLimitStore, OnModuleDestroy
{
  private readonly logger = new Logger(RedisCapabilityRateLimitStore.name);
  private readonly bucketPrefix: string;
  private readonly registryKey: string;
  private readonly options: CapabilityRateLimitStoreOptions;
  private _client?: RedisLikeClient;
  private clientMode: RedisClientMode | null = null;

  constructor(
    @Inject(CAPABILITY_RATE_LIMIT_STORE_OPTIONS)
    options: CapabilityRateLimitStoreOptions,
    @Optional()
    client?: RedisLikeClient,
  ) {
    this.options = options;
    this.bucketPrefix = `${options.redisKeyPrefix}:${RATE_LIMIT_CLUSTER_HASH_TAG}:bucket`;
    this.registryKey = `${options.redisKeyPrefix}:${RATE_LIMIT_CLUSTER_HASH_TAG}:keys`;
    this._client = client;
    this.clientMode = client ? 'standalone' : null;
  }

  private get client(): RedisLikeClient {
    if (!this._client) {
      const client = this.createClusterClient(this.options);
      this.useClient(client, 'cluster');
      return client;
    }
    return this._client;
  }

  async consume(
    key: string,
    _limit: number,
    windowMs: number,
    now: number,
  ): Promise<RateLimitBucketConsumeResult> {
    const result = await this.executeWithStandaloneFallback((client) =>
      client.eval(
        RATE_LIMIT_REDIS_SCRIPT,
        2,
        this.buildBucketKey(key),
        this.registryKey,
        String(now),
        String(windowMs),
        RATE_LIMIT_BUCKET_HASH_FIELDS.COUNT,
        RATE_LIMIT_BUCKET_HASH_FIELDS.WINDOW_STARTED_AT,
        RATE_LIMIT_BUCKET_HASH_FIELDS.WINDOW_MS,
      ),
    );
    const [count, windowStartedAt, storedWindowMs] = result.map((value) =>
      Number(value),
    );

    return {
      count,
      windowStartedAt,
      windowMs: storedWindowMs,
      resetAt: windowStartedAt + storedWindowMs,
    };
  }

  async entries() {
    const bucketKeys = await this.executeWithStandaloneFallback((client) =>
      client.smembers(this.registryKey),
    );
    if (bucketKeys.length === 0) {
      return [];
    }

    const responses = await this.executeWithStandaloneFallback((client) => {
      const pipeline = client.pipeline();
      for (const bucketKey of bucketKeys) {
        pipeline.hmget(
          bucketKey,
          RATE_LIMIT_BUCKET_HASH_FIELDS.COUNT,
          RATE_LIMIT_BUCKET_HASH_FIELDS.WINDOW_STARTED_AT,
          RATE_LIMIT_BUCKET_HASH_FIELDS.WINDOW_MS,
        );
        pipeline.pttl(bucketKey);
      }
      return pipeline.exec();
    });
    const results: Array<{ key: string; state: RateLimitBucketState }> = [];
    const staleKeys: string[] = [];

    for (let index = 0; index < bucketKeys.length; index += 1) {
      const bucketKey = bucketKeys[index];
      const hashResponse = responses[index * 2]?.[1] as string[] | undefined;
      const ttlResponse = responses[index * 2 + 1]?.[1];
      const ttl =
        typeof ttlResponse === 'number' ? ttlResponse : Number(ttlResponse);

      if (!hashResponse || ttl <= 0) {
        staleKeys.push(bucketKey);
        continue;
      }

      const [countValue, windowStartedAtValue, windowMsValue] = hashResponse;
      if (!countValue || !windowStartedAtValue || !windowMsValue) {
        staleKeys.push(bucketKey);
        continue;
      }

      results.push({
        key: this.parseBucketKey(bucketKey),
        state: {
          count: Number(countValue),
          windowStartedAt: Number(windowStartedAtValue),
          windowMs: Number(windowMsValue),
        },
      });
    }

    if (staleKeys.length > 0) {
      await this.executeWithStandaloneFallback((client) =>
        client.srem(this.registryKey, ...staleKeys),
      );
    }

    return results;
  }

  async onModuleDestroy() {
    if (!this._client) {
      return;
    }
    try {
      await this._client.quit();
    } catch (error) {
      this.logger.warn(
        `redis rate limit store quit 失败: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
      this._client.disconnect();
    }
  }

  private buildBucketKey(key: string) {
    return `${this.bucketPrefix}:${key}`;
  }

  private parseBucketKey(bucketKey: string) {
    return bucketKey.startsWith(`${this.bucketPrefix}:`)
      ? bucketKey.slice(this.bucketPrefix.length + 1)
      : bucketKey;
  }

  private async executeWithStandaloneFallback<T>(
    operation: (client: RedisLikeClient) => Promise<T>,
  ): Promise<T> {
    try {
      return await operation(this.client);
    } catch (error) {
      if (!this.shouldFallbackToStandalone(error)) {
        throw error;
      }

      this.logger.warn('Redis Cluster 探测失败，降级使用单机 Redis 客户端');
      this.closeCurrentClient();
      this.useClient(this.createStandaloneClient(this.options), 'standalone');
      return operation(this.client);
    }
  }

  private shouldFallbackToStandalone(error: unknown) {
    if (this.clientMode !== 'cluster') {
      return false;
    }

    const message = error instanceof Error ? error.message : String(error);
    return (
      message.includes('cluster support disabled') ||
      message.includes('Failed to refresh slots cache')
    );
  }

  private useClient(client: RedisLikeClient, mode: RedisClientMode) {
    client.on?.('error', (err: Error) => {
      this.logger.warn(`Redis rate limit store 连接错误: ${err.message}`);
    });
    this._client = client;
    this.clientMode = mode;
  }

  private closeCurrentClient() {
    try {
      this._client?.disconnect();
    } catch {
      // 切换客户端时忽略关闭失败，后续命令会使用新客户端。
    }
    this._client = undefined;
    this.clientMode = null;
  }

  private createClusterClient(options: CapabilityRateLimitStoreOptions) {
    return new Cluster(this.resolveClusterStartupNodes(options), {
      redisOptions: {
        password: this.resolveRedisPassword(options),
        connectTimeout: options.redisConnectTimeoutMs,
        tls: options.redisTls ? {} : undefined,
      },
    }) as unknown as RedisLikeClient;
  }

  private createStandaloneClient(options: CapabilityRateLimitStoreOptions) {
    if (options.redisUrl) {
      const url = options.redisPassword
        ? this.injectPasswordIntoRedisUrl(
            options.redisUrl,
            options.redisPassword,
          )
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

  private resolveClusterStartupNodes(
    options: CapabilityRateLimitStoreOptions,
  ): ClusterNode[] {
    if (!options.redisUrl?.trim()) {
      return [{ host: options.redisHost, port: options.redisPort }];
    }

    const nodes = options.redisUrl
      .split(REDIS_NODE_SEPARATOR)
      .map((nodeText) => this.parseClusterNode(nodeText.trim()))
      .filter((node): node is ClusterNode => node !== null);

    return nodes.length > 0
      ? nodes
      : [{ host: options.redisHost, port: options.redisPort }];
  }

  private parseClusterNode(nodeText: string): ClusterNode | null {
    if (!nodeText) {
      return null;
    }

    try {
      const parsed = nodeText.includes('://')
        ? new URL(nodeText)
        : new URL(`redis://${nodeText}`);
      return {
        host: parsed.hostname,
        port: parsed.port ? Number(parsed.port) : REDIS_DEFAULT_PORT,
      };
    } catch {
      throw new Error(`Redis Cluster 节点配置无效：${nodeText}`);
    }
  }

  private resolveRedisPassword(options: CapabilityRateLimitStoreOptions) {
    if (options.redisPassword) {
      return options.redisPassword;
    }

    const firstUrl = options.redisUrl?.split(REDIS_NODE_SEPARATOR)[0]?.trim();
    if (!firstUrl?.includes('://')) {
      return undefined;
    }

    try {
      const parsed = new URL(firstUrl);
      return parsed.password ? decodeURIComponent(parsed.password) : undefined;
    } catch {
      return undefined;
    }
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
