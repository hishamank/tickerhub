/**
 * Provider Health Repository
 *
 * Thin coordinator over the ConfigStore (provider configuration) and
 * HealthMetricsStore (time-series health metrics) ports. Used by health-monitor
 * workflows to read configs and persist/prune reliability metrics.
 *
 * Refactored from the source Drizzle-coupled repository to depend only on the
 * storage ports, so any backend (in-memory, SQLite, custom) works.
 */

import type {
  ConfigStore,
  ProviderConfigRecord,
} from "../ports/config-store.js";
import type {
  HealthMetricsStore,
  HealthMetricRecord,
} from "../ports/health-store.js";

export class ProviderHealthRepository {
  constructor(
    private readonly configStore: ConfigStore,
    private readonly healthStore: HealthMetricsStore,
  ) {}

  /** Get all provider configuration override records. */
  async getAllConfigs(): Promise<ProviderConfigRecord[]> {
    return this.configStore.getAllConfigs();
  }

  /** Append a provider health metric record. */
  async insertHealthMetric(metric: HealthMetricRecord): Promise<void> {
    await this.healthStore.insertHealthMetric(metric);
  }

  /** Delete health metrics older than the given date. */
  async deleteOlderThan(date: Date): Promise<void> {
    await this.healthStore.deleteOlderThan(date);
  }

  /** Most recent metrics for a provider, newest first. */
  async getRecentMetrics(
    providerName: string,
    limit: number,
  ): Promise<HealthMetricRecord[]> {
    return this.healthStore.getRecentMetrics(providerName, limit);
  }
}
