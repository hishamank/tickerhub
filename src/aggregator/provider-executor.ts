/**
 * ProviderExecutor — the execution layer beneath the aggregator.
 *
 * Wraps each provider call with uniform resilience (a per-provider circuit
 * breaker), records health metrics, and tracks rate-limit quotas. Extracted
 * from SmartAggregator so the aggregator stays focused on selection/fallback.
 *
 * Transient-failure recovery is handled by cross-provider fallback (and
 * stale-on-error in the SWR cache), so no per-call retry is layered on here.
 */

import { CircuitBreaker } from "../resilience/index.js";
import { ProviderError, ProviderErrorCode } from "../types/provider.js";
import type { Logger } from "../ports/logger.js";
import type { HealthMonitor } from "../health/health-monitor.js";
import type {
  RateLimitTracker,
  RateLimits,
} from "../rate-limiting/tracker.js";
import type { ProviderMetadata } from "../config/provider-registry.js";

export class ProviderExecutor {
  /** One circuit breaker per provider, applied uniformly to every call. */
  private readonly circuitBreakers = new Map<string, CircuitBreaker>();

  constructor(
    private readonly healthMonitor: HealthMonitor,
    private readonly rateLimitTracker: RateLimitTracker,
    private readonly logger: Logger,
  ) {}

  /** Per-window limits for a provider, drawn from its registry metadata. */
  private limitsFor(meta: ProviderMetadata): RateLimits {
    return {
      perMinute: meta.rateLimitPerMinute,
      perHour: meta.rateLimitPerHour,
      perDay: meta.rateLimitPerDay,
      perMonth: meta.rateLimitPerMonth,
    };
  }

  /** True if any of the provider's quota windows is exhausted. */
  isRateLimited(
    credentials: Record<string, string> | null,
    providerName: string,
    meta: ProviderMetadata,
  ): boolean {
    const exhausted = this.rateLimitTracker.isExhausted(
      credentials,
      providerName,
      this.limitsFor(meta),
    );
    if (exhausted) {
      this.logger.debug(`Rate limit exhausted for ${providerName}, skipping`);
    }
    return exhausted;
  }

  /** Record a consumed request against the provider's quota. */
  recordRateLimit(
    credentials: Record<string, string> | null,
    providerName: string,
    meta: ProviderMetadata,
  ): void {
    this.rateLimitTracker.record(
      credentials,
      providerName,
      this.limitsFor(meta),
    );
  }

  /** Current health snapshot for a provider. */
  getProviderHealth(providerId: string): {
    status: "enabled" | "degraded" | "disabled";
    successRate: number;
    avgLatency: number;
  } {
    const metrics = this.healthMonitor.getMetrics(providerId);
    if (!metrics) {
      return { status: "enabled", successRate: 1.0, avgLatency: 0 };
    }
    return {
      status: metrics.status,
      successRate: this.healthMonitor.getSuccessRate(providerId) || 1.0,
      avgLatency: metrics.avgLatencyMs,
    };
  }

  resetRateLimits(): void {
    this.rateLimitTracker.reset();
  }

  /**
   * Get (or lazily create) the circuit breaker for a provider. Rate-limit
   * errors are excluded from tripping the breaker — they indicate quota, not a
   * failing provider.
   */
  private getBreaker(providerName: string): CircuitBreaker {
    let breaker = this.circuitBreakers.get(providerName);
    if (!breaker) {
      breaker = new CircuitBreaker({
        name: providerName,
        failureThreshold: 5,
        resetTimeoutMs: 60_000,
        logger: this.logger,
        isFailure: (error) =>
          !(
            error instanceof ProviderError &&
            error.code === ProviderErrorCode.RATE_LIMIT_EXCEEDED
          ),
      });
      this.circuitBreakers.set(providerName, breaker);
    }
    return breaker;
  }

  /** Execute a provider operation through its breaker, recording health. */
  async execute<T>(
    providerName: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const startTime = Date.now();
    try {
      const result = await this.getBreaker(providerName).execute(operation);
      this.healthMonitor.recordRequest(providerName, {
        success: true,
        latencyMs: Date.now() - startTime,
        timestamp: new Date(),
      });
      return result;
    } catch (error) {
      this.healthMonitor.recordRequest(providerName, {
        success: false,
        latencyMs: Date.now() - startTime,
        timestamp: new Date(),
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}
