/**
 * Health Monitor Service
 *
 * Tracks provider health by monitoring success/failure rates and response times.
 * Maintains a sliding window of recent requests to calculate health metrics.
 *
 * Migrated from @repo/market-data
 */

import type { ProviderStatus } from '../types/provider.js';

export interface HealthMetrics {
  successCount: number;
  failureCount: number;
  avgLatencyMs: number;
  consecutiveFailures: number;
  status: ProviderStatus;
  lastSuccessAt?: Date;
  lastFailureAt?: Date;
}

export interface RequestResult {
  success: boolean;
  latencyMs: number;
  timestamp: Date;
  error?: string;
}

/**
 * Health Monitor for tracking provider health metrics
 */
export class HealthMonitor {
  private metrics: Map<string, HealthMetrics> = new Map();
  private recentRequests: Map<string, RequestResult[]> = new Map();
  private readonly maxRecentRequests = 10; // Track last 10 requests for success rate

  /**
   * Record a request result for a provider
   * @param providerName - Name of the provider
   * @param result - Request result (success/failure, latency, etc.)
   */
  recordRequest(providerName: string, result: RequestResult): void {
    // Initialize if first request
    if (!this.metrics.has(providerName)) {
      this.metrics.set(providerName, {
        successCount: 0,
        failureCount: 0,
        avgLatencyMs: 0,
        consecutiveFailures: 0,
        status: 'enabled',
      });
      this.recentRequests.set(providerName, []);
    }

    const metrics = this.metrics.get(providerName)!;
    const recent = this.recentRequests.get(providerName)!;

    // Add to recent requests (maintain sliding window of last 10)
    recent.push(result);
    if (recent.length > this.maxRecentRequests) {
      recent.shift();
    }

    // Update metrics based on result
    if (result.success) {
      metrics.consecutiveFailures = 0;
      metrics.lastSuccessAt = result.timestamp;
    } else {
      metrics.consecutiveFailures++;
      metrics.lastFailureAt = result.timestamp;
    }

    // Recalculate success/failure counts from recent window
    metrics.successCount = recent.filter((r) => r.success).length;
    metrics.failureCount = recent.filter((r) => !r.success).length;

    // Recalculate average latency from successful requests
    const successfulRequests = recent.filter((r) => r.success);
    if (successfulRequests.length > 0) {
      const totalLatency = successfulRequests.reduce(
        (sum, r) => sum + r.latencyMs,
        0
      );
      metrics.avgLatencyMs = Math.round(
        totalLatency / successfulRequests.length
      );
    }
  }

  /**
   * Get current health metrics for a provider
   * @param providerName - Name of the provider
   * @returns Current health metrics or null if no data
   */
  getMetrics(providerName: string): HealthMetrics | null {
    return this.metrics.get(providerName) || null;
  }

  /**
   * Get all provider health metrics
   * @returns Map of provider names to their health metrics
   */
  getAllMetrics(): Map<string, HealthMetrics> {
    return new Map(this.metrics);
  }

  /**
   * Update provider status
   * @param providerName - Name of the provider
   * @param status - New status
   */
  updateStatus(providerName: string, status: ProviderStatus): void {
    const metrics = this.metrics.get(providerName);
    if (metrics) {
      metrics.status = status;
    }
  }

  /**
   * Calculate success rate for a provider (0.0 - 1.0)
   * @param providerName - Name of the provider
   * @returns Success rate or null if no data
   */
  getSuccessRate(providerName: string): number | null {
    const metrics = this.metrics.get(providerName);
    if (!metrics) {
      return null;
    }

    const total = metrics.successCount + metrics.failureCount;
    if (total === 0) {
      return null;
    }

    return metrics.successCount / total;
  }

  /**
   * Check if provider is healthy based on metrics
   * @param providerName - Name of the provider
   * @returns true if provider is healthy
   */
  isHealthy(providerName: string): boolean {
    const metrics = this.metrics.get(providerName);
    if (!metrics) {
      return true; // No data yet, assume healthy
    }

    // Provider is unhealthy if disabled
    if (metrics.status === 'disabled') {
      return false;
    }

    // Provider is degraded but operational
    if (metrics.status === 'degraded') {
      return true; // Can still use, but with lower priority
    }

    return true;
  }

  /**
   * Reset metrics for a provider (useful for testing)
   * @param providerName - Name of the provider
   */
  reset(providerName: string): void {
    this.metrics.delete(providerName);
    this.recentRequests.delete(providerName);
  }

  /**
   * Reset all metrics (useful for testing)
   */
  resetAll(): void {
    this.metrics.clear();
    this.recentRequests.clear();
  }
}
