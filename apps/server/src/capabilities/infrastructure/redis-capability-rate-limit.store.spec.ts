import {
  type CapabilityRateLimitStoreOptions,
  type RateLimitBucketState,
} from './capability-rate-limit.store';
import { RedisCapabilityRateLimitStore } from './redis-capability-rate-limit.store';

class FakeRedisPipeline {
  private readonly commands: Array<{
    type: 'hmget' | 'pttl';
    key: string;
    fields?: string[];
  }> = [];

  constructor(private readonly client: FakeRedisClient) {}

  hmget(key: string, ...fields: string[]) {
    this.commands.push({ type: 'hmget', key, fields });
    return this;
  }

  pttl(key: string) {
    this.commands.push({ type: 'pttl', key });
    return this;
  }

  async exec() {
    return this.commands.map((command) => {
      if (command.type === 'hmget') {
        return [null, this.client.hmget(command.key, ...(command.fields ?? []))] as [
          null,
          string[],
        ];
      }

      return [null, this.client.pttl(command.key)] as [null, number];
    });
  }
}

class FakeRedisClient {
  private readonly hashes = new Map<string, RateLimitBucketState>();
  private readonly expiresAt = new Map<string, number>();
  private readonly registry = new Map<string, Set<string>>();
  private currentTime = 0;

  async eval(
    _script: string,
    _keyCount: number,
    bucketKey: string,
    registryKey: string,
    nowText: string,
    windowMsText: string,
  ) {
    const now = Number(nowText);
    const windowMs = Number(windowMsText);
    this.currentTime = now;
    const current = this.hashes.get(bucketKey);

    if (!current || now - current.windowStartedAt >= current.windowMs) {
      this.hashes.set(bucketKey, {
        count: 1,
        windowStartedAt: now,
        windowMs,
      });
      this.expiresAt.set(bucketKey, now + windowMs);
    } else {
      const nextState = {
        ...current,
        count: current.count + 1,
      };
      this.hashes.set(bucketKey, nextState);
      this.expiresAt.set(bucketKey, current.windowStartedAt + current.windowMs);
    }

    if (!this.registry.has(registryKey)) {
      this.registry.set(registryKey, new Set());
    }
    this.registry.get(registryKey)!.add(bucketKey);
    const state = this.hashes.get(bucketKey)!;

    return [state.count, state.windowStartedAt, state.windowMs] as [
      number,
      number,
      number,
    ];
  }

  async smembers(key: string) {
    return Array.from(this.registry.get(key) ?? []);
  }

  pipeline() {
    return new FakeRedisPipeline(this);
  }

  async srem(key: string, ...members: string[]) {
    const set = this.registry.get(key);
    if (!set) {
      return 0;
    }

    let removed = 0;
    for (const member of members) {
      if (set.delete(member)) {
        removed += 1;
      }
    }

    return removed;
  }

  async quit() {
    return 'OK';
  }

  disconnect() {}

  hmget(key: string, ...fields: string[]) {
    const state = this.hashes.get(key);
    return fields.map((field) => {
      if (!state) {
        return null;
      }

      switch (field) {
        case 'count':
          return String(state.count);
        case 'windowStartedAt':
          return String(state.windowStartedAt);
        case 'windowMs':
          return String(state.windowMs);
        default:
          return null;
      }
    });
  }

  pttl(key: string) {
    const expiresAt = this.expiresAt.get(key);
    if (!expiresAt) {
      return -2;
    }

    return expiresAt - this.currentTime;
  }
}

describe('RedisCapabilityRateLimitStore', () => {
  const options: CapabilityRateLimitStoreOptions = {
    driver: 'redis',
    redisUrl: 'redis://localhost:6379/0',
    redisHost: '127.0.0.1',
    redisPort: 6379,
    redisDb: 0,
    redisTls: false,
    redisKeyPrefix: 'openviking:test:rate-limit',
    redisConnectTimeoutMs: 1500,
  };

  it('should consume buckets atomically and expose snapshot entries', async () => {
    const client = new FakeRedisClient();
    const store = new RedisCapabilityRateLimitStore(options, client);

    const first = await store.consume('tenant:tenant-1', 120, 60_000, 1_000);
    const second = await store.consume('tenant:tenant-1', 120, 60_000, 5_000);
    const entries = await store.entries();

    expect(first).toEqual({
      count: 1,
      windowStartedAt: 1_000,
      windowMs: 60_000,
      resetAt: 61_000,
    });
    expect(second).toEqual({
      count: 2,
      windowStartedAt: 1_000,
      windowMs: 60_000,
      resetAt: 61_000,
    });
    expect(entries).toEqual([
      {
        key: 'tenant:tenant-1',
        state: {
          count: 2,
          windowStartedAt: 1_000,
          windowMs: 60_000,
        },
      },
    ]);
  });
});
