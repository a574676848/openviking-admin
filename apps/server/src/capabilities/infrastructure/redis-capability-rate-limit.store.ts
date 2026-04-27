import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  Optional,
} from '@nestjs/common';
import Redis from 'ioredis';
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
}

@Injectable()
export class RedisCapabilityRateLimitStore
  implements CapabilityRateLimitStore, OnModuleDestroy
{
  private readonly logger = new Logger(RedisCapabilityRateLimitStore.name);
  private readonly bucketPrefix: string;
  private readonly registryKey: string;
  private readonly client: RedisLikeClient;

  constructor(
    @Inject(CAPABILITY_RATE_LIMIT_STORE_OPTIONS)
    private readonly options: CapabilityRateLimitStoreOptions,
    @Optional()
    client?: RedisLikeClient,
  ) {
    this.bucketPrefix = `${options.redisKeyPrefix}:bucket`;
    this.registryKey = `${options.redisKeyPrefix}:keys`;
    this.client = client ?? this.createClient(options);
  }

  async consume(
    key: string,
    _limit: number,
    windowMs: number,
    now: number,
  ): Promise<RateLimitBucketConsumeResult> {
    const result = await this.client.eval(
      RATE_LIMIT_REDIS_SCRIPT,
      2,
      this.buildBucketKey(key),
      this.registryKey,
      String(now),
      String(windowMs),
      RATE_LIMIT_BUCKET_HASH_FIELDS.COUNT,
      RATE_LIMIT_BUCKET_HASH_FIELDS.WINDOW_STARTED_AT,
      RATE_LIMIT_BUCKET_HASH_FIELDS.WINDOW_MS,
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
    const bucketKeys = await this.client.smembers(this.registryKey);
    if (bucketKeys.length === 0) {
      return [];
    }

    const pipeline = this.client.pipeline();
    for (const bucketKey of bucketKeys) {
      pipeline.hmget(
        bucketKey,
        RATE_LIMIT_BUCKET_HASH_FIELDS.COUNT,
        RATE_LIMIT_BUCKET_HASH_FIELDS.WINDOW_STARTED_AT,
        RATE_LIMIT_BUCKET_HASH_FIELDS.WINDOW_MS,
      );
      pipeline.pttl(bucketKey);
    }

    const responses = await pipeline.exec();
    const results: Array<{ key: string; state: RateLimitBucketState }> = [];
    const staleKeys: string[] = [];

    for (let index = 0; index < bucketKeys.length; index += 1) {
      const bucketKey = bucketKeys[index];
      const hashResponse = responses[index * 2]?.[1] as string[] | undefined;
      const ttlResponse = responses[index * 2 + 1]?.[1];
      const ttl = typeof ttlResponse === 'number' ? ttlResponse : Number(ttlResponse);

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
      await this.client.srem(this.registryKey, ...staleKeys);
    }

    return results;
  }

  async onModuleDestroy() {
    try {
      await this.client.quit();
    } catch (error) {
      this.logger.warn(
        `redis rate limit store quit failed: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
      this.client.disconnect();
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

  private createClient(options: CapabilityRateLimitStoreOptions) {
    if (options.redisUrl) {
      return new Redis(options.redisUrl, {
        connectTimeout: options.redisConnectTimeoutMs,
        keyPrefix: '',
        tls: options.redisTls ? {} : undefined,
      }) as unknown as RedisLikeClient;
    }

    return new Redis({
      host: options.redisHost,
      port: options.redisPort,
      db: options.redisDb,
      password: options.redisPassword,
      connectTimeout: options.redisConnectTimeoutMs,
      keyPrefix: '',
      tls: options.redisTls ? {} : undefined,
    }) as unknown as RedisLikeClient;
  }
}
