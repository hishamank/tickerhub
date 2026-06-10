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

export interface ProviderRateLimitStatus {
  provider: string;
  limit: {
    perMinute?: number | undefined;
    perHour?: number | undefined;
    perDay?: number | undefined;
  };
  current: {
    perMinute?: number | undefined;
    perHour?: number | undefined;
    perDay?: number | undefined;
  };
  remaining: {
    perMinute?: number | undefined;
    perHour?: number | undefined;
    perDay?: number | undefined;
  };
  resetAt: {
    perMinute?: Date | undefined;
    perHour?: Date | undefined;
    perDay?: Date | undefined;
  };
}

export interface ProviderErrorInfo {
  timestamp: Date;
  errorCode: string;
  errorMessage: string;
  operation: string;
  retryable: boolean;
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
   * Get rate limit status for a specific provider
   * Note: Simplified implementation - QuotaTracker doesn't expose getStatus yet
   */
  async getRateLimitStatus(
    _providerName: string,
  ): Promise<ProviderRateLimitStatus | null> {
    // TODO: Implement using RateLimitTracker.getRemainingBudget once a public
    // status projection is defined. For now, rate-limit details aren't exposed.
    return null;
  }

  /**
   * Get recent errors for a specific provider
   * Note: This is a simplified version. In production, you'd query from audit logs.
   */
  async getRecentErrors(
    _providerName: string,
    _limit: number = 10,
  ): Promise<ProviderErrorInfo[]> {
    // TODO: Implement audit-log querying when a persistent audit store is added.
    // For now there is no persistent error history, so return an empty list.
    return [];
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
