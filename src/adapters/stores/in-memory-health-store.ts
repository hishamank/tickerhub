/**
 * InMemoryHealthStore — default HealthMetricsStore adapter.
 *
 * Keeps a bounded, per-provider ring buffer of recent health metrics in
 * process memory. Suitable for single-process monitoring and tests. For
 * durable time-series storage use the SQLite adapter from `/sqlite`.
 */

import type {
  HealthMetricsStore,
  HealthMetricRecord,
} from "../../ports/health-store.js";

const DEFAULT_MAX_PER_PROVIDER = 1000;

export class InMemoryHealthStore implements HealthMetricsStore {
  private readonly byProvider = new Map<string, HealthMetricRecord[]>();

  constructor(private readonly maxPerProvider = DEFAULT_MAX_PER_PROVIDER) {}

  async insertHealthMetric(metric: HealthMetricRecord): Promise<void> {
    const list = this.byProvider.get(metric.providerName) ?? [];
    list.push(metric);
    // Trim oldest beyond the cap (records are appended in chronological order).
    if (list.length > this.maxPerProvider) {
      list.splice(0, list.length - this.maxPerProvider);
    }
    this.byProvider.set(metric.providerName, list);
  }

  async deleteOlderThan(date: Date): Promise<void> {
    const cutoff = date.getTime();
    for (const [provider, list] of this.byProvider) {
      const kept = list.filter((m) => m.timestamp.getTime() >= cutoff);
      if (kept.length > 0) {
        this.byProvider.set(provider, kept);
      } else {
        this.byProvider.delete(provider);
      }
    }
  }

  async getRecentMetrics(
    providerName: string,
    limit: number,
  ): Promise<HealthMetricRecord[]> {
    const list = this.byProvider.get(providerName) ?? [];
    // Newest first.
    return list.slice(-limit).reverse();
  }
}
