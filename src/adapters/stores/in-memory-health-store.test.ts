import { describe, it, expect } from "vitest";
import { InMemoryHealthStore } from "./in-memory-health-store.js";
import type { HealthMetricRecord } from "../../ports/health-store.js";

function record(
  providerName: string,
  timestamp: Date,
  overrides: Partial<HealthMetricRecord> = {},
): HealthMetricRecord {
  return {
    providerName,
    timestamp,
    successCount: 1,
    failureCount: 0,
    avgLatencyMs: 10,
    consecutiveFailures: 0,
    status: "enabled",
    ...overrides,
  };
}

describe("InMemoryHealthStore", () => {
  it("returns recent metrics newest-first, limited", async () => {
    const store = new InMemoryHealthStore();
    await store.insertHealthMetric(record("finnhub", new Date(1000)));
    await store.insertHealthMetric(record("finnhub", new Date(2000)));
    await store.insertHealthMetric(record("finnhub", new Date(3000)));

    const recent = await store.getRecentMetrics("finnhub", 2);
    expect(recent.map((m) => m.timestamp.getTime())).toEqual([3000, 2000]);
  });

  it("isolates metrics by provider", async () => {
    const store = new InMemoryHealthStore();
    await store.insertHealthMetric(record("finnhub", new Date(1000)));
    await store.insertHealthMetric(record("polygon", new Date(1000)));
    expect(await store.getRecentMetrics("finnhub", 10)).toHaveLength(1);
    expect(await store.getRecentMetrics("polygon", 10)).toHaveLength(1);
    expect(await store.getRecentMetrics("tiingo", 10)).toHaveLength(0);
  });

  it("enforces the per-provider cap, dropping oldest", async () => {
    const store = new InMemoryHealthStore(2);
    await store.insertHealthMetric(record("finnhub", new Date(1000)));
    await store.insertHealthMetric(record("finnhub", new Date(2000)));
    await store.insertHealthMetric(record("finnhub", new Date(3000)));
    const all = await store.getRecentMetrics("finnhub", 10);
    expect(all.map((m) => m.timestamp.getTime())).toEqual([3000, 2000]);
  });

  it("deletes records older than a cutoff", async () => {
    const store = new InMemoryHealthStore();
    await store.insertHealthMetric(record("finnhub", new Date(1000)));
    await store.insertHealthMetric(record("finnhub", new Date(5000)));
    await store.deleteOlderThan(new Date(3000));
    const all = await store.getRecentMetrics("finnhub", 10);
    expect(all.map((m) => m.timestamp.getTime())).toEqual([5000]);
  });
});
