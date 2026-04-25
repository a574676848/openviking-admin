import { Injectable } from '@nestjs/common';
import {
  CapabilityRateLimitStore,
} from './capability-rate-limit.store';

interface RateLimitBucketState {
  count: number;
  windowStartedAt: number;
}

@Injectable()
export class InMemoryCapabilityRateLimitStore
  implements CapabilityRateLimitStore
{
  private readonly buckets = new Map<string, RateLimitBucketState>();

  get(key: string) {
    return this.buckets.get(key);
  }

  set(key: string, state: RateLimitBucketState) {
    this.buckets.set(key, state);
  }

  entries() {
    return Array.from(this.buckets.entries()).map(([key, state]) => ({
      key,
      state,
    }));
  }
}
