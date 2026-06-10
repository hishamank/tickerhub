/**
 * Failure Detector
 *
 * Detects provider failures based on configured thresholds:
 * - 3 consecutive failures OR
 * - >50% failure rate in last 10 requests
 *
 * Migrated from @repo/market-data
 */

import type { HealthMetrics } from './health-monitor.js';

export interface FailureThresholds {
  consecutiveFailures: number; // Number of consecutive failures to trigger disable
  failureRateThreshold: number; // Failure rate (0.0 - 1.0) to trigger disable
  minRequestsForRate: number; // Minimum requests needed to calculate failure rate
}

export const DEFAULT_THRESHOLDS: FailureThresholds = {
  consecutiveFailures: 3,
  failureRateThreshold: 0.5, // 50%
  minRequestsForRate: 10,
};

export class FailureDetector {
  constructor(private thresholds: FailureThresholds = DEFAULT_THRESHOLDS) {}

  /**
   * Check if provider should be disabled based on failure thresholds
   * @param metrics - Provider health metrics
   * @returns true if provider should be disabled
   */
  shouldDisableProvider(metrics: HealthMetrics): boolean {
    // Already disabled
    if (metrics.status === 'disabled') {
      return false;
    }

    // Check consecutive failures threshold
    if (this.hasExceededConsecutiveFailures(metrics)) {
      return true;
    }

    // Check failure rate threshold
    if (this.hasExceededFailureRate(metrics)) {
      return true;
    }

    return false;
  }

  /**
   * Check if provider has exceeded consecutive failures threshold
   * @param metrics - Provider health metrics
   * @returns true if threshold exceeded
   */
  hasExceededConsecutiveFailures(metrics: HealthMetrics): boolean {
    return metrics.consecutiveFailures >= this.thresholds.consecutiveFailures;
  }

  /**
   * Check if provider has exceeded failure rate threshold
   * @param metrics - Provider health metrics
   * @returns true if threshold exceeded
   */
  hasExceededFailureRate(metrics: HealthMetrics): boolean {
    const totalRequests = metrics.successCount + metrics.failureCount;

    // Need minimum requests to calculate meaningful failure rate
    if (totalRequests < this.thresholds.minRequestsForRate) {
      return false;
    }

    const failureRate = metrics.failureCount / totalRequests;
    return failureRate > this.thresholds.failureRateThreshold;
  }

  /**
   * Check if provider should be marked as degraded
   * @param metrics - Provider health metrics
   * @returns true if provider should be degraded
   */
  shouldDegradeProvider(metrics: HealthMetrics): boolean {
    // Already disabled or degraded
    if (metrics.status === 'disabled' || metrics.status === 'degraded') {
      return false;
    }

    const totalRequests = metrics.successCount + metrics.failureCount;

    // Need minimum requests to calculate meaningful failure rate
    if (totalRequests < this.thresholds.minRequestsForRate) {
      return false;
    }

    const failureRate = metrics.failureCount / totalRequests;

    // Degrade if failure rate is between 30% and 50%
    return (
      failureRate > 0.3 && failureRate <= this.thresholds.failureRateThreshold
    );
  }
}
