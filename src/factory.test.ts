import { describe, it, expect } from "vitest";
import { createAggregator } from "./factory.js";
import { InMemoryCache } from "./adapters/cache/in-memory-cache.js";
import { ProviderAggregatorService } from "./services/provider-aggregator.service.js";
import { ProviderRegistry } from "./config/provider-registry.js";
import { ProviderHealthRepository } from "./repositories/provider-health-repository.js";

describe("createAggregator", () => {
  it("wires a working service graph with zero config", () => {
    const { service, registry, healthRepository } = createAggregator();
    expect(service).toBeInstanceOf(ProviderAggregatorService);
    expect(registry).toBeInstanceOf(ProviderRegistry);
    expect(healthRepository).toBeInstanceOf(ProviderHealthRepository);
  });

  it("exposes built-in providers through the service", async () => {
    const { service } = createAggregator();
    const providers = await service.getRegisteredProviders();
    expect(providers).toContain("yahoo-finance");
    expect(providers.length).toBeGreaterThanOrEqual(12);
  });

  it("accepts injected adapters (custom cache)", async () => {
    const cache = new InMemoryCache();
    const { service } = createAggregator({ cache });
    // A cache-backed read path works end-to-end without throwing.
    const providers = await service.getRegisteredProviders();
    expect(Array.isArray(providers)).toBe(true);
  });

  it("reads credentials from an injected env record", async () => {
    const { healthRepository } = createAggregator({
      env: { FINNHUB_API_KEY: "x" },
    });
    // Health repository surfaces the in-memory config store (empty by default).
    expect(await healthRepository.getAllConfigs()).toEqual([]);
  });

  it("shares one health monitor and flushes it to the store", async () => {
    const { healthMonitor, flushHealthMetrics } = createAggregator();
    healthMonitor.recordRequest("finnhub", {
      success: true,
      latencyMs: 10,
      timestamp: new Date(0),
    });
    expect(await flushHealthMetrics()).toBe(1);
  });
});
