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

import { CircuitBreaker, CircuitOpenError } from "../resilience/index.js";
import { RequestBudgetExhaustedError } from "../resilience/request-budget.js";
import { ProviderError, ProviderErrorCode } from "../types/provider.js";
import {
  isEntitlementDenied,
  sanitizeSecrets,
} from "../providers/provider-utils.js";
import type { Logger } from "../ports/logger.js";
import { toHealthRecord } from "../health/flush.js";
import type {
  HealthMonitor,
  RequestResult,
} from "../health/health-monitor.js";
import type { HealthMetricsStore } from "../ports/health-store.js";
import type {
  RateLimitTracker,
  RateLimits,
} from "../rate-limiting/tracker.js";
import type { ProviderMetadata } from "../config/provider-registry.js";

export interface ProviderHealthSnapshot {
  status: "enabled" | "degraded" | "disabled";
  successRate: number;
  avgLatency: number;
  /**
   * `observed` when the figures come from real attempts in this process;
   * `registry-default` when there are none yet and they are placeholders.
   */
  provenance: "observed" | "registry-default";
}

export class ProviderExecutor {
  /** One circuit breaker per provider, applied uniformly to every call. */
  private readonly circuitBreakers = new Map<string, CircuitBreaker>();

  constructor(
    private readonly healthMonitor: HealthMonitor,
    private readonly rateLimitTracker: RateLimitTracker,
    private readonly logger: Logger,
    private readonly healthStore?: HealthMetricsStore,
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
  getProviderHealth(providerId: string): ProviderHealthSnapshot {
    const metrics = this.healthMonitor.getMetrics(providerId);
    if (!metrics) {
      return {
        status: "enabled",
        successRate: 1.0,
        avgLatency: 0,
        provenance: "registry-default",
      };
    }
    return {
      status: metrics.status,
      successRate: this.healthMonitor.getSuccessRate(providerId) ?? 1.0,
      avgLatency: metrics.avgLatencyMs,
      provenance: "observed",
    };
  }

  resetRateLimits(): void {
    this.rateLimitTracker.reset();
  }

  /**
   * Get (or lazily create) the circuit breaker for a provider. Rate-limit and
   * plan-denial errors are excluded from tripping the breaker — they indicate
   * quota or subscription scope, and one unentitled endpoint must not take
   * down the provider's other endpoints.
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
          !isEntitlementDenied(error) &&
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
      await this.recordAttempt(providerName, {
        success: true,
        latencyMs: Date.now() - startTime,
        timestamp: new Date(),
      });
      return result;
    } catch (error) {
      // An open breaker or spent budget withheld the request, so it says nothing
      // about the provider's health.
      if (
        error instanceof CircuitOpenError ||
        error instanceof RequestBudgetExhaustedError
      ) {
        throw error;
      }
      await this.recordAttempt(providerName, {
        success: false,
        latencyMs: Date.now() - startTime,
        timestamp: new Date(),
        error: sanitizeSecrets(
          error instanceof Error ? error.message : String(error),
        ),
        ...(isEntitlementDenied(error) && { entitlementDenied: true }),
      });
      throw error;
    }
  }

  /**
   * Update live metrics and write them through to the configured store. A store
   * outage must never turn a good provider response into a failure.
   */
  private async recordAttempt(
    providerName: string,
    result: RequestResult,
  ): Promise<void> {
    this.healthMonitor.recordRequest(providerName, result);
    const metrics = this.healthMonitor.getMetrics(providerName);
    if (!this.healthStore || !metrics) return;
    try {
      await this.healthStore.insertHealthMetric(
        toHealthRecord(providerName, metrics, result.timestamp),
      );
    } catch (error) {
      this.logger.warn(`Failed to persist health for ${providerName}`, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
