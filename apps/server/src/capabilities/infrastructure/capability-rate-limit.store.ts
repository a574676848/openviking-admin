export interface RateLimitBucketState {
  count: number;
  windowStartedAt: number;
  windowMs: number;
}

export interface RateLimitBucketConsumeResult extends RateLimitBucketState {
  resetAt: number;
}

export const CAPABILITY_RATE_LIMIT_STORE_DRIVER = {
  MEMORY: 'memory',
  REDIS: 'redis',
} as const;

export type CapabilityRateLimitStoreDriver =
  (typeof CAPABILITY_RATE_LIMIT_STORE_DRIVER)[keyof typeof CAPABILITY_RATE_LIMIT_STORE_DRIVER];

export interface CapabilityRateLimitStoreOptions {
  driver: CapabilityRateLimitStoreDriver;
  redisUrl?: string;
  redisHost: string;
  redisPort: number;
  redisDb: number;
  redisPassword?: string;
  redisTls: boolean;
  redisKeyPrefix: string;
  redisConnectTimeoutMs: number;
}

export interface CapabilityRateLimitStore {
  consume(
    key: string,
    limit: number,
    windowMs: number,
    now: number,
  ): Promise<RateLimitBucketConsumeResult>;
  entries(): Promise<Array<{ key: string; state: RateLimitBucketState }>>;
}

export const CAPABILITY_RATE_LIMIT_STORE = Symbol('CAPABILITY_RATE_LIMIT_STORE');
export const CAPABILITY_RATE_LIMIT_STORE_OPTIONS = Symbol(
  'CAPABILITY_RATE_LIMIT_STORE_OPTIONS',
);
