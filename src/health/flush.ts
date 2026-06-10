/**
 * Health metric flushing.
 *
 * Snapshots the in-memory HealthMonitor's current per-provider metrics into a
 * HealthMetricsStore. Call on an interval (e.g. every 30s) to build a durable
 * time series; pair with `HealthMetricsStore.deleteOlderThan` to prune.
 */

import type { HealthMonitor } from "./health-monitor.js";
import type { HealthMetricsStore } from "../ports/health-store.js";

/**
 * Write a point-in-time snapshot of every tracked provider's health to the
 * store. Returns the number of records written.
 */
export async function flushHealthMetrics(
  monitor: HealthMonitor,
  store: HealthMetricsStore,
  now: Date = new Date(),
): Promise<number> {
  const all = monitor.getAllMetrics();
  let written = 0;
  for (const [providerName, m] of all) {
    await store.insertHealthMetric({
      providerName,
      timestamp: now,
      successCount: m.successCount,
      failureCount: m.failureCount,
      avgLatencyMs: m.avgLatencyMs,
      consecutiveFailures: m.consecutiveFailures,
      status: m.status,
      lastSuccessAt: m.lastSuccessAt ?? null,
      lastFailureAt: m.lastFailureAt ?? null,
    });
    written++;
  }
  return written;
}
