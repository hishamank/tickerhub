import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { openSqliteStores, type SqliteStores } from "./index.js";
import type { ProviderConfigRecord } from "../../ports/config-store.js";
import type { HealthMetricRecord } from "../../ports/health-store.js";

function config(name: string): ProviderConfigRecord {
  return {
    name,
    providerType: "rest",
    requiresKey: true,
    rateLimitPerMinute: 60,
    rateLimitPerHour: null,
    rateLimitPerDay: null,
    rateLimitPerMonth: null,
    reliabilityScore: 8.5,
    enabled: true,
    paidTier: false,
    supportedDataTypes: ["prices", "dividends"],
    priority: 1,
  };
}

function metric(name: string, ts: number): HealthMetricRecord {
  return {
    providerName: name,
    timestamp: new Date(ts),
    successCount: 5,
    failureCount: 1,
    avgLatencyMs: 42,
    consecutiveFailures: 0,
    status: "enabled",
    lastSuccessAt: new Date(ts),
    lastFailureAt: null,
  };
}

describe("SQLite stores", () => {
  let stores: SqliteStores;

  beforeEach(async () => {
    stores = await openSqliteStores(":memory:");
  });

  afterEach(() => {
    stores.db.close();
  });

  it("round-trips a provider config (including JSON arrays and booleans)", async () => {
    expect(await stores.configStore.getAllConfigs()).toEqual([]);
    stores.configStore.upsertConfig(config("finnhub"));
    const all = await stores.configStore.getAllConfigs();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({
      name: "finnhub",
      requiresKey: true,
      enabled: true,
      paidTier: false,
      reliabilityScore: 8.5,
      supportedDataTypes: ["prices", "dividends"],
      rateLimitPerDay: null,
    });
  });

  it("upsert replaces an existing config by name", async () => {
    stores.configStore.upsertConfig(config("finnhub"));
    stores.configStore.upsertConfig({ ...config("finnhub"), enabled: false });
    const all = await stores.configStore.getAllConfigs();
    expect(all).toHaveLength(1);
    expect(all[0]?.enabled).toBe(false);
  });

  it("stores and returns recent health metrics newest-first", async () => {
    await stores.healthStore.insertHealthMetric(metric("finnhub", 1000));
    await stores.healthStore.insertHealthMetric(metric("finnhub", 3000));
    await stores.healthStore.insertHealthMetric(metric("finnhub", 2000));

    const recent = await stores.healthStore.getRecentMetrics("finnhub", 2);
    expect(recent.map((m) => m.timestamp.getTime())).toEqual([3000, 2000]);
    expect(recent[0]).toMatchObject({
      providerName: "finnhub",
      successCount: 5,
      status: "enabled",
      lastFailureAt: null,
    });
    expect(recent[0]?.lastSuccessAt).toBeInstanceOf(Date);
  });

  it("prunes metrics older than a cutoff", async () => {
    await stores.healthStore.insertHealthMetric(metric("finnhub", 1000));
    await stores.healthStore.insertHealthMetric(metric("finnhub", 5000));
    await stores.healthStore.deleteOlderThan(new Date(3000));
    const recent = await stores.healthStore.getRecentMetrics("finnhub", 10);
    expect(recent.map((m) => m.timestamp.getTime())).toEqual([5000]);
  });

  it("round-trips per-hour and per-month rate limits", async () => {
    stores.configStore.upsertConfig({
      ...config("tiingo"),
      rateLimitPerHour: 50,
      rateLimitPerMonth: 1000,
    });
    const all = await stores.configStore.getAllConfigs();
    expect(all[0]).toMatchObject({
      rateLimitPerHour: 50,
      rateLimitPerMonth: 1000,
    });
  });

  describe("SqliteCache", () => {
    it("stores and retrieves a value", async () => {
      await stores.cache.set("k", { a: 1 });
      expect(await stores.cache.get<{ a: number }>("k")).toEqual({ a: 1 });
    });

    it("returns null for a missing key", async () => {
      expect(await stores.cache.get("missing")).toBeNull();
    });

    it("expires a value past its TTL", async () => {
      await stores.cache.set("k", "v", 0); // expires immediately
      expect(await stores.cache.get("k")).toBeNull();
    });

    it("deletes by glob pattern", async () => {
      await stores.cache.set("getQuote:AAPL", 1);
      await stores.cache.set("getQuote:MSFT", 2);
      await stores.cache.set("getDividends:AAPL", 3);
      const removed = await stores.cache.deletePattern("getQuote:*");
      expect(removed).toBe(2);
      expect(await stores.cache.get("getQuote:AAPL")).toBeNull();
      expect(await stores.cache.get("getDividends:AAPL")).toBe(3);
    });
  });

  describe("SqliteRateLimitStore", () => {
    it("persists and returns window state", () => {
      stores.rateLimitStore.set("hash1", "fmp", "day", {
        used: 7,
        limit: 250,
        windowStart: 1000,
      });
      expect(stores.rateLimitStore.get("hash1", "fmp", "day")).toEqual({
        used: 7,
        limit: 250,
        windowStart: 1000,
      });
    });

    it("returns null for an untracked window and clears on reset", () => {
      expect(stores.rateLimitStore.get("h", "fmp", "minute")).toBeNull();
      stores.rateLimitStore.set("h", "fmp", "minute", {
        used: 1,
        limit: 5,
        windowStart: 0,
      });
      stores.rateLimitStore.reset();
      expect(stores.rateLimitStore.get("h", "fmp", "minute")).toBeNull();
    });
  });
});
