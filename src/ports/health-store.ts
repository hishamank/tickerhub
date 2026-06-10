/**
 * HealthMetricsStore port.
 *
 * Persists time-series provider health metrics. The default
 * `InMemoryHealthStore` keeps a bounded in-process ring buffer; a
 * `SqliteHealthStore` is available from `/sqlite`.
 *
 * Records are keyed by provider name (no foreign-key/UUID coupling) so the
 * contract stays storage-agnostic.
 */
export interface HealthMetricRecord {
  providerName: string;
  timestamp: Date;
  successCount: number;
  failureCount: number;
  avgLatencyMs: number;
  consecutiveFailures: number;
  status: string;
  lastSuccessAt?: Date | null;
  lastFailureAt?: Date | null;
  disabledAt?: Date | null;
  disabledReason?: string | null;
}

export interface HealthMetricsStore {
  /** Append a health metric record. */
  insertHealthMetric(metric: HealthMetricRecord): Promise<void>;

  /** Delete records with a timestamp strictly older than `date`. */
  deleteOlderThan(date: Date): Promise<void>;

  /** Most recent records for a provider, newest first. */
  getRecentMetrics(
    providerName: string,
    limit: number,
  ): Promise<HealthMetricRecord[]>;
}
