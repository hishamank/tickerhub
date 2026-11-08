/**
 * Health metric flushing.
 *
 * Snapshots the in-memory HealthMonitor's current per-provider metrics into a
 * HealthMetricsStore. Call on an interval (e.g. every 30s) to build a durable
 * time series; pair with `HealthMetricsStore.deleteOlderThan` to prune.
 */

import type { HealthMetrics, HealthMonitor } from "./health-monitor.js";
import type {
  HealthMetricRecord,
  HealthMetricsStore,
} from "../ports/health-store.js";

/** The durable form of a provider's current metrics. */
export function toHealthRecord(
  providerName: string,
  metrics: HealthMetrics,
  timestamp: Date,
): HealthMetricRecord {
  return {
    providerName,
    timestamp,
    successCount: metrics.successCount,
    failureCount: metrics.failureCount,
    avgLatencyMs: metrics.avgLatencyMs,
    consecutiveFailures: metrics.consecutiveFailures,
    status: metrics.status,
    lastSuccessAt: metrics.lastSuccessAt ?? null,
    lastFailureAt: metrics.lastFailureAt ?? null,
  };
}

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
    await store.insertHealthMetric(toHealthRecord(providerName, m, now));
    written++;
  }
  return written;
}
