import { Injectable } from '@nestjs/common';
import { CapabilityMetricsService } from './capability-metrics.service';
import { CapabilityRateLimitService } from './capability-rate-limit.service';

function labelsFromKey(key: string) {
  return key
    .split('|')
    .map((pair) => pair.split('='))
    .filter((pair) => pair.length === 2)
    .map(([label, value]) => `${label}="${String(value).replace(/"/g, '\\"')}"`)
    .join(',');
}

@Injectable()
export class CapabilityPrometheusExporterService {
  constructor(
    private readonly capabilityMetricsService: CapabilityMetricsService,
    private readonly capabilityRateLimitService: CapabilityRateLimitService,
  ) {}

  render() {
    const metrics = this.capabilityMetricsService.snapshot();
    const rateLimit = this.capabilityRateLimitService.snapshot();
    const lines: string[] = [
      '# HELP capability_invocations_total Total capability invocations by outcome.',
      '# TYPE capability_invocations_total counter',
    ];

    for (const counter of metrics.counters) {
      lines.push(
        `capability_invocations_total{${labelsFromKey(counter.key)}} ${counter.value}`,
      );
    }

    lines.push(
      '# HELP capability_latency_p95_ms Rolling P95 latency in milliseconds.',
      '# TYPE capability_latency_p95_ms gauge',
    );
    lines.push(
      '# HELP capability_latency_p99_ms Rolling P99 latency in milliseconds.',
      '# TYPE capability_latency_p99_ms gauge',
    );

    for (const latency of metrics.latency) {
      lines.push(
        `capability_latency_p95_ms{${labelsFromKey(latency.key)}} ${latency.p95Ms}`,
      );
      lines.push(
        `capability_latency_p99_ms{${labelsFromKey(latency.key)}} ${latency.p99Ms}`,
      );
    }

    lines.push(
      '# HELP capability_rate_limit_bucket_count Active rate limit bucket counters.',
      '# TYPE capability_rate_limit_bucket_count gauge',
    );

    for (const bucket of rateLimit.activeBuckets) {
      const normalizedKey = bucket.key.replace(':', '|subject=');
      lines.push(
        `capability_rate_limit_bucket_count{${labelsFromKey(normalizedKey)}} ${bucket.count}`,
      );
    }

    return `${lines.join('\n')}\n`;
  }
}
