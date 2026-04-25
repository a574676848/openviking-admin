interface RateLimitBucketState {
  count: number;
  windowStartedAt: number;
}

export interface CapabilityRateLimitStore {
  get(key: string): RateLimitBucketState | undefined;
  set(key: string, state: RateLimitBucketState): void;
  entries(): Array<{ key: string; state: RateLimitBucketState }>;
}

export const CAPABILITY_RATE_LIMIT_STORE = Symbol('CAPABILITY_RATE_LIMIT_STORE');
