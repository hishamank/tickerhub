/**
 * Health Metrics Query Service
 *
 * Provides methods to query provider health metrics, rate limit status,
 * and recent errors for monitoring and dashboard purposes.
 */

import type { HealthMonitor } from "./health-monitor.js";
import type { RateLimitTracker } from "../rate-limiting/tracker.js";

export interface ProviderHealthMetrics {
  name: string;
  status: "enabled" | "disabled" | "degraded";
  successCount: number;
  failureCount: number;
  avgLatencyMs: number;
  consecutiveFailures: number;
  lastSuccessAt: Date | null;
  lastFailureAt: Date | null;
  successRate: number;
}

/**
 * Remaining rate-limit budget for a provider/credential pair. Values are
 * `undefined` when no limit of that period is tracked (i.e. unlimited or unused).
 */
export interface ProviderRateLimitStatus {
  provider: string;
  remaining: {
    perMinute?: number | undefined;
    perDay?: number | undefined;
  };
}

/** A recent failed request for a provider. */
export interface ProviderErrorInfo {
  timestamp: Date;
  errorMessage: string;
}

export class HealthMetricsQuery {
  constructor(
    private healthMonitor: HealthMonitor,
    private rateLimitTracker: RateLimitTracker,
  ) {}

  /**
   * Get health metrics for all providers
   */
  async getAllProviderMetrics(): Promise<ProviderHealthMetrics[]> {
    const allMetrics = this.healthMonitor.getAllMetrics();

    return Array.from(allMetrics.entries()).map(([name, metrics]) => {
      const totalRequests = metrics.successCount + metrics.failureCount;
      const successRate =
        totalRequests > 0 ? (metrics.successCount / totalRequests) * 100 : 0;

      return {
        name,
        status: metrics.status,
        successCount: metrics.successCount,
        failureCount: metrics.failureCount,
        avgLatencyMs: metrics.avgLatencyMs,
        consecutiveFailures: metrics.consecutiveFailures,
        lastSuccessAt: metrics.lastSuccessAt ?? null,
        lastFailureAt: metrics.lastFailureAt ?? null,
        successRate: Math.round(successRate * 100) / 100,
      };
    });
  }

  /**
   * Get health metrics for a specific provider
   */
  async getProviderMetrics(
    providerName: string,
  ): Promise<ProviderHealthMetrics | null> {
    const metrics = this.healthMonitor.getMetrics(providerName);

    if (!metrics) {
      return null;
    }

    const totalRequests = metrics.successCount + metrics.failureCount;
    const successRate =
      totalRequests > 0 ? (metrics.successCount / totalRequests) * 100 : 0;

    return {
      name: providerName,
      status: metrics.status,
      successCount: metrics.successCount,
      failureCount: metrics.failureCount,
      avgLatencyMs: metrics.avgLatencyMs,
      consecutiveFailures: metrics.consecutiveFailures,
      lastSuccessAt: metrics.lastSuccessAt ?? null,
      lastFailureAt: metrics.lastFailureAt ?? null,
      successRate: Math.round(successRate * 100) / 100,
    };
  }

  /**
   * Get the remaining rate-limit budget for a provider. Pass the same
   * credentials used for requests (budgets are tracked per credential set);
   * omit for the shared/system bucket.
   */
  async getRateLimitStatus(
    providerName: string,
    credentials: Record<string, string> | null = null,
  ): Promise<ProviderRateLimitStatus> {
    const budget = this.rateLimitTracker.getRemainingBudget(
      credentials,
      providerName,
    );
    return {
      provider: providerName,
      remaining: {
        perMinute: budget.minute >= 0 ? budget.minute : undefined,
        perDay: budget.day >= 0 ? budget.day : undefined,
      },
    };
  }

  /**
   * Get recent failed requests for a provider (newest first), drawn from the
   * health monitor's in-memory request window.
   */
  async getRecentErrors(
    providerName: string,
    limit: number = 10,
  ): Promise<ProviderErrorInfo[]> {
    return this.healthMonitor
      .getRecentRequests(providerName)
      .filter((r) => !r.success)
      .slice(-limit)
      .reverse()
      .map((r) => ({
        timestamp: r.timestamp,
        errorMessage: r.error ?? "Unknown error",
      }));
  }

  /**
   * Get overall system health summary
   */
  async getSystemHealthSummary(): Promise<{
    totalProviders: number;
    enabledProviders: number;
    disabledProviders: number;
    overallSuccessRate: number;
    avgLatencyMs: number;
  }> {
    const allMetrics = await this.getAllProviderMetrics();

    const enabledProviders = allMetrics.filter(
      (m) => m.status === "enabled",
    ).length;
    const disabledProviders = allMetrics.filter(
      (m) => m.status === "disabled",
    ).length;

    const totalSuccess = allMetrics.reduce((sum, m) => sum + m.successCount, 0);
    const totalFailure = allMetrics.reduce((sum, m) => sum + m.failureCount, 0);
    const totalRequests = totalSuccess + totalFailure;

    const overallSuccessRate =
      totalRequests > 0 ? (totalSuccess / totalRequests) * 100 : 0;

    const avgLatencyMs =
      allMetrics.length > 0
        ? allMetrics.reduce((sum, m) => sum + m.avgLatencyMs, 0) /
          allMetrics.length
        : 0;

    return {
      totalProviders: allMetrics.length,
      enabledProviders,
      disabledProviders,
      overallSuccessRate: Math.round(overallSuccessRate * 100) / 100,
      avgLatencyMs: Math.round(avgLatencyMs * 100) / 100,
    };
  }
}
