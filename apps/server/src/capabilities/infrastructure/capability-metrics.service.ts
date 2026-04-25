import { Injectable } from '@nestjs/common';
import type {
  CapabilityChannel,
  CapabilityId,
  ClientType,
  CredentialType,
} from '../domain/capability.types';

interface CounterDimension {
  capability?: CapabilityId | 'credential.exchange';
  channel: CapabilityChannel | 'auth';
  clientType?: ClientType;
  credentialType?: CredentialType | 'api_key';
  flow?: string;
  outcome: 'success' | 'failure' | 'rejected';
}

interface LatencySample {
  capability: CapabilityId;
  channel: CapabilityChannel;
  durationMs: number;
}

function buildCounterKey(dimension: CounterDimension) {
  return [
    `capability=${dimension.capability ?? 'none'}`,
    `channel=${dimension.channel}`,
    `clientType=${dimension.clientType ?? 'none'}`,
    `credentialType=${dimension.credentialType ?? 'none'}`,
    `flow=${dimension.flow ?? 'none'}`,
    `outcome=${dimension.outcome}`,
  ].join('|');
}

function percentile(values: number[], point: number) {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(point * sorted.length) - 1),
  );
  return sorted[index] ?? 0;
}

@Injectable()
export class CapabilityMetricsService {
  private readonly counters = new Map<string, number>();

  private readonly latencySamples = new Map<string, number[]>();

  private readonly maxLatencySamples = 200;

  incrementCounter(dimension: CounterDimension) {
    const key = buildCounterKey(dimension);
    this.counters.set(key, (this.counters.get(key) ?? 0) + 1);
  }

  recordLatency(sample: LatencySample) {
    const key = `capability=${sample.capability}|channel=${sample.channel}`;
    const samples = this.latencySamples.get(key) ?? [];
    samples.push(sample.durationMs);
    if (samples.length > this.maxLatencySamples) {
      samples.shift();
    }
    this.latencySamples.set(key, samples);
  }

  snapshot() {
    const counters = Array.from(this.counters.entries()).map(([key, value]) => ({
      key,
      value,
    }));
    const latency = Array.from(this.latencySamples.entries()).map(
      ([key, values]) => ({
        key,
        count: values.length,
        p95Ms: percentile(values, 0.95),
        p99Ms: percentile(values, 0.99),
      }),
    );

    return {
      generatedAt: new Date().toISOString(),
      counters,
      latency,
    };
  }
}
