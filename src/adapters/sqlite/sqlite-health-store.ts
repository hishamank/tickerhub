/**
 * SqliteHealthStore — SQLite-backed HealthMetricsStore adapter.
 *
 * Persists time-series provider health metrics to a `provider_health_metrics`
 * table. Timestamps are stored as epoch milliseconds.
 */

import type { Database } from "better-sqlite3";
import type {
  HealthMetricsStore,
  HealthMetricRecord,
} from "../../ports/health-store.js";
import { ensureSchema } from "./schema.js";

interface HealthRow {
  provider_name: string;
  timestamp: number;
  success_count: number;
  failure_count: number;
  avg_latency_ms: number;
  consecutive_failures: number;
  status: string;
  last_success_at: number | null;
  last_failure_at: number | null;
  disabled_at: number | null;
  disabled_reason: string | null;
}

const toMs = (d: Date | null | undefined): number | null =>
  d ? d.getTime() : null;

const toDate = (ms: number | null): Date | null =>
  ms === null ? null : new Date(ms);

export class SqliteHealthStore implements HealthMetricsStore {
  constructor(private readonly db: Database) {
    ensureSchema(this.db);
  }

  async insertHealthMetric(metric: HealthMetricRecord): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO provider_health_metrics
         (provider_name, timestamp, success_count, failure_count,
          avg_latency_ms, consecutive_failures, status, last_success_at,
          last_failure_at, disabled_at, disabled_reason)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        metric.providerName,
        metric.timestamp.getTime(),
        metric.successCount,
        metric.failureCount,
        metric.avgLatencyMs,
        metric.consecutiveFailures,
        metric.status,
        toMs(metric.lastSuccessAt),
        toMs(metric.lastFailureAt),
        toMs(metric.disabledAt),
        metric.disabledReason ?? null,
      );
  }

  async deleteOlderThan(date: Date): Promise<void> {
    this.db
      .prepare("DELETE FROM provider_health_metrics WHERE timestamp < ?")
      .run(date.getTime());
  }

  async getRecentMetrics(
    providerName: string,
    limit: number,
  ): Promise<HealthMetricRecord[]> {
    const rows = this.db
      .prepare(
        `SELECT * FROM provider_health_metrics
         WHERE provider_name = ?
         ORDER BY timestamp DESC
         LIMIT ?`,
      )
      .all(providerName, limit) as HealthRow[];

    return rows.map((row) => ({
      providerName: row.provider_name,
      timestamp: new Date(row.timestamp),
      successCount: row.success_count,
      failureCount: row.failure_count,
      avgLatencyMs: row.avg_latency_ms,
      consecutiveFailures: row.consecutive_failures,
      status: row.status,
      lastSuccessAt: toDate(row.last_success_at),
      lastFailureAt: toDate(row.last_failure_at),
      disabledAt: toDate(row.disabled_at),
      disabledReason: row.disabled_reason,
    }));
  }
}
