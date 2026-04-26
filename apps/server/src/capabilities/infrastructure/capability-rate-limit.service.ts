import { Inject, Injectable } from '@nestjs/common';
import type { CapabilityId, Principal } from '../domain/capability.types';
import { CapabilityRateLimitException } from './capability-rate-limit.exception';
import { CAPABILITY_RATE_LIMIT_STORE } from './capability-rate-limit.store';
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

const CAPABILITY_RATE_LIMIT_RULES: RateLimitBucketRule[] = [
  { scope: 'tenant', limit: 120, windowMs: 60_000 },
  { scope: 'user', limit: 60, windowMs: 60_000 },
  { scope: 'clientType', limit: 90, windowMs: 60_000 },
  { scope: 'capability', limit: 80, windowMs: 60_000 },
];

export interface CapabilityRateLimitSnapshot {
  generatedAt: string;
  activeBuckets: Array<{
    key: string;
    count: number;
    windowStartedAt: string;
  }>;
  rules: RateLimitBucketRule[];
}

@Injectable()
export class CapabilityRateLimitService {
  private readonly rules = CAPABILITY_RATE_LIMIT_RULES;

  constructor(
    @Inject(CAPABILITY_RATE_LIMIT_STORE)
    private readonly store: CapabilityRateLimitStore,
  ) {}

  async assertAllowed(principal: Principal, capability: CapabilityId) {
    const now = Date.now();
    const decisions: RateLimitDecision[] = [];
    let rejected: RateLimitDecision | undefined;

    for (const rule of this.rules) {
      const decision = await this.consume(rule, principal, capability, now);
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

  async snapshot(): Promise<CapabilityRateLimitSnapshot> {
    const entries = await this.store.entries();

    return {
      generatedAt: new Date().toISOString(),
      activeBuckets: entries.map(({ key, state }) => ({
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

  private async consume(
    rule: RateLimitBucketRule,
    principal: Principal,
    capability: CapabilityId,
    now: number,
  ): Promise<RateLimitDecision> {
    const subject = this.resolveSubject(rule.scope, principal, capability);
    const key = `${rule.scope}:${subject}`;
    const state = await this.store.consume(key, rule.limit, rule.windowMs, now);
    const nextCount = state.count;

    return {
      allowed: nextCount <= rule.limit,
      scope: rule.scope,
      key,
      limit: rule.limit,
      remaining: Math.max(rule.limit - nextCount, 0),
      resetAt: new Date(state.resetAt).toISOString(),
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
