import { Injectable } from '@nestjs/common';
import {
  CapabilityRateLimitStore,
  type RateLimitBucketConsumeResult,
  type RateLimitBucketState,
} from './capability-rate-limit.store';

@Injectable()
export class InMemoryCapabilityRateLimitStore
  implements CapabilityRateLimitStore
{
  private readonly buckets = new Map<string, RateLimitBucketState>();

  async consume(
    key: string,
    _limit: number,
    windowMs: number,
    now: number,
  ): Promise<RateLimitBucketConsumeResult> {
    const current = this.buckets.get(key);

    if (!current || now - current.windowStartedAt >= current.windowMs) {
      const nextState = {
        count: 1,
        windowStartedAt: now,
        windowMs,
      };
      this.buckets.set(key, nextState);
      return {
        ...nextState,
        resetAt: now + windowMs,
      };
    }

    const nextState = {
      ...current,
      count: current.count + 1,
    };
    this.buckets.set(key, nextState);

    return {
      ...nextState,
      resetAt: current.windowStartedAt + current.windowMs,
    };
  }

  async entries() {
    return Array.from(this.buckets.entries()).map(([key, state]) => ({
      key,
      state,
    }));
  }
}
