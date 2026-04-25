import { Inject, Injectable } from '@nestjs/common';
import type { CapabilityId, Principal } from '../domain/capability.types';
import { CapabilityRateLimitException } from './capability-rate-limit.exception';
import {
  CAPABILITY_RATE_LIMIT_STORE,
} from './capability-rate-limit.store';
import type { CapabilityRateLimitStore } from './capability-rate-limit.store';

interface RateLimitBucketRule {
  scope: 'tenant' | 'user' | 'clientType' | 'capability';
  limit: number;
  windowMs: number;
}

interface RateLimitDecision {
  allowed: boolean;
  scope: RateLimitBucketRule['scope'];
  key: string;
  limit: number;
  remaining: number;
  resetAt: string;
}

@Injectable()
export class CapabilityRateLimitService {
  private readonly rules: RateLimitBucketRule[] = [
    { scope: 'tenant', limit: 120, windowMs: 60_000 },
    { scope: 'user', limit: 60, windowMs: 60_000 },
    { scope: 'clientType', limit: 90, windowMs: 60_000 },
    { scope: 'capability', limit: 80, windowMs: 60_000 },
  ];

  constructor(
    @Inject(CAPABILITY_RATE_LIMIT_STORE)
    private readonly store: CapabilityRateLimitStore,
  ) {}

  assertAllowed(principal: Principal, capability: CapabilityId) {
    const now = Date.now();
    const decisions: RateLimitDecision[] = [];
    let rejected: RateLimitDecision | undefined;

    for (const rule of this.rules) {
      const decision = this.consume(rule, principal, capability, now);
      decisions.push(decision);
      if (!decision.allowed) {
        rejected = decision;
        break;
      }
    }

    if (rejected) {
      throw new CapabilityRateLimitException(rejected);
    }

    return decisions;
  }

  snapshot() {
    return {
      generatedAt: new Date().toISOString(),
      activeBuckets: this.store.entries().map(({ key, state }) => ({
        key,
        count: state.count,
        windowStartedAt: new Date(state.windowStartedAt).toISOString(),
      })),
      rules: this.rules.map((rule) => ({
        scope: rule.scope,
        limit: rule.limit,
        windowMs: rule.windowMs,
      })),
    };
  }

  private consume(
    rule: RateLimitBucketRule,
    principal: Principal,
    capability: CapabilityId,
    now: number,
  ): RateLimitDecision {
    const subject = this.resolveSubject(rule.scope, principal, capability);
    const key = `${rule.scope}:${subject}`;
    const current = this.store.get(key);

    if (!current || now - current.windowStartedAt >= rule.windowMs) {
      this.store.set(key, {
        count: 1,
        windowStartedAt: now,
      });
      return {
        allowed: true,
        scope: rule.scope,
        key,
        limit: rule.limit,
        remaining: Math.max(rule.limit - 1, 0),
        resetAt: new Date(now + rule.windowMs).toISOString(),
      };
    }

    const nextCount = current.count + 1;
    const nextState = {
      ...current,
      count: nextCount,
    };
    this.store.set(key, nextState);

    return {
      allowed: nextCount <= rule.limit,
      scope: rule.scope,
      key,
      limit: rule.limit,
      remaining: Math.max(rule.limit - nextCount, 0),
      resetAt: new Date(current.windowStartedAt + rule.windowMs).toISOString(),
    };
  }

  private resolveSubject(
    scope: RateLimitBucketRule['scope'],
    principal: Principal,
    capability: CapabilityId,
  ) {
    switch (scope) {
      case 'tenant':
        return principal.tenantId ?? 'anonymous';
      case 'user':
        return principal.userId;
      case 'clientType':
        return `${principal.clientType}:${capability}`;
      case 'capability':
        return capability;
      default:
        return 'unknown';
    }
  }
}
