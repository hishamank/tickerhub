/**
 * Regression tests for aggregator fallback, terminal-result caching and health
 * recording, using the real engine with fake providers. All data is synthetic.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { SmartAggregator, type SmartAggregatorDeps } from "./smart-aggregator.js";
import { createAggregator } from "../factory.js";
import { InMemoryHealthStore } from "../adapters/stores/in-memory-health-store.js";
import { HealthMonitor } from "../health/health-monitor.js";
import { FailureDetector } from "../health/failure-detector.js";
import { ProviderFactory } from "../providers/provider-factory.js";
import { ProviderRegistry } from "../config/provider-registry.js";
import { InMemoryConfigStore } from "../adapters/stores/in-memory-config-store.js";
import type { ProviderConfigRecord } from "../ports/config-store.js";
import type { HealthMetricsStore } from "../ports/health-store.js";
import { ProviderAggregatorService } from "../services/provider-aggregator.service.js";
import { SwrCache } from "../cache/swr-cache.js";
import { InMemoryCache } from "../adapters/cache/in-memory-cache.js";
import { ProviderError, ProviderErrorCode } from "../types/provider.js";
import type {
  MarketDataProvider,
  DataType,
  RatingData,
} from "../types/index.js";

const ALL_TYPES: DataType[] = ["prices", "dividends", "earnings", "events", "ratings", "profile"];

function cfg(name: string, priority: number): ProviderConfigRecord {
  return {
    name,
    providerType: "rest",
    requiresKey: false,
    rateLimitPerMinute: null,
    rateLimitPerHour: null,
    rateLimitPerDay: null,
    rateLimitPerMonth: null,
    reliabilityScore: 5,
    enabled: true,
    paidTier: false,
    supportedDataTypes: ALL_TYPES,
    priority,
  };
}

type FakeMethods = Partial<MarketDataProvider>;

/** Register fake providers under the given names, tried in the given order. */
function installProviders(providers: Record<string, FakeMethods>): ProviderConfigRecord[] {
  vi.spyOn(ProviderFactory, "create").mockImplementation((name) => {
    const methods = providers[name];
    if (!methods) return null;
    return {
      name,
      supportedDataTypes: ALL_TYPES,
      rateLimit: { requestsPerMinute: 60 },
      fetchQuote: async () => null,
      ...methods,
    } as MarketDataProvider;
  });
  return Object.keys(providers).map((name, index) => cfg(name, index + 1));
}

async function aggregatorOver(
  configs: ProviderConfigRecord[],
  deps: Partial<SmartAggregatorDeps> = {},
): Promise<SmartAggregator> {
  const registry = new ProviderRegistry(new InMemoryConfigStore(configs));
  await registry.load();
  return new SmartAggregator({
    registry,
    credentials: { resolve: async () => null },
    ...deps,
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("list fallback", () => {
  const from = new Date("2024-01-01");
  const to = new Date("2024-01-05");

  it.each([
    ["fetchDividends", (a: SmartAggregator) => a.fetchDividends("AAPL")],
    ["fetchEarnings", (a: SmartAggregator) => a.fetchEarnings("AAPL")],
    ["fetchEvents", (a: SmartAggregator) => a.fetchEvents("AAPL")],
    ["fetchHistoricalPrices", (a: SmartAggregator) => a.fetchHistoricalPrices("AAPL", "system", from, to)],
  ] as const)("%s moves past a provider returning []", async (method, call) => {
    const row = { synthetic: true };
    const second = vi.fn(async () => [row]);
    const agg = await aggregatorOver(
      installProviders({
        p1: { [method]: vi.fn(async () => []) },
        p2: { [method]: second },
      }),
    );

    expect(await call(agg)).toEqual([row]);
    expect(second).toHaveBeenCalledTimes(1);
  });
});

describe("all-provider failure at the service layer", () => {
  const rating: RatingData = { consensus: "buy", numberOfAnalysts: 3 };

  async function serviceOver(configs: ProviderConfigRecord[]) {
    return new ProviderAggregatorService(
      await aggregatorOver(configs),
      new SwrCache(new InMemoryCache()),
    );
  }

  it("reports why each provider failed, caches nothing, and retries next call", async () => {
    const denied = vi.fn(async (): Promise<RatingData | null> => {
      throw new ProviderError(
        ProviderErrorCode.ENTITLEMENT_REQUIRED,
        "plan does not include ratings",
        false,
      );
    });
    const flaky = vi
      .fn<() => Promise<RatingData | null>>()
      .mockRejectedValueOnce(new Error("upstream exploded"))
      .mockResolvedValueOnce(rating);
    const service = await serviceOver(
      installProviders({ p1: { fetchRatings: denied }, p2: { fetchRatings: flaky } }),
    );

    const first = await service.getRatings("AAPL");
    const second = await service.getRatings("AAPL");

    expect(first.data).toBeNull();
    expect(first.metadata.source).toBe("provider");
    expect(first.metadata.warnings).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/p1.*plan does not include ratings/),
        expect.stringMatching(/p2.*upstream exploded/),
      ]),
    );
    expect(second.data).toEqual(rating);
    expect(flaky).toHaveBeenCalledTimes(2);
  });

  it("redacts credentials from reported provider failures", async () => {
    const leaky = vi.fn(async (): Promise<RatingData | null> => {
      throw new Error("GET https://x.test/r?apikey=synthetic-secret failed");
    });
    const service = await serviceOver(
      installProviders({ p1: { fetchRatings: leaky } }),
    );

    const { metadata } = await service.getRatings("AAPL");

    expect(metadata.warnings?.join(" ")).toContain("failed");
    expect(metadata.warnings?.join(" ")).not.toContain("synthetic-secret");
  });

  it("warns honestly when providers answered but had no data", async () => {
    const service = await serviceOver(
      installProviders({ p1: { fetchRatings: vi.fn(async () => null) } }),
    );

    const { data, metadata } = await service.getRatings("AAPL");

    expect(data).toBeNull();
    expect(metadata.warnings).toEqual([
      "No provider returned data; result was not cached",
    ]);
  });
});

describe("provider health recording", () => {
  it("reports a real 0% success rate and labels it as observed", async () => {
    const agg = await aggregatorOver(
      installProviders({
        p1: {
          fetchRatings: vi.fn(async () => {
            throw new Error("down");
          }),
        },
      }),
    );

    await agg.fetchRatings("AAPL");

    expect(agg.getProviderHealth("p1")).toMatchObject({
      successRate: 0,
      provenance: "observed",
    });
  });

  it("does not count a circuit-breaker short-circuit as an attempt", async () => {
    const healthMonitor = new HealthMonitor();
    const failing = vi.fn(async () => {
      throw new Error("down");
    });
    const agg = await aggregatorOver(
      installProviders({ p1: { fetchRatings: failing } }),
      { healthMonitor },
    );

    for (let i = 0; i < 8; i++) await agg.fetchRatings("AAPL");

    expect(failing).toHaveBeenCalledTimes(5); // breaker opens at 5 failures
    expect(healthMonitor.getRecentRequests("p1")).toHaveLength(5);
  });

  it("records plan denials without tripping the breaker or disabling the provider", async () => {
    const healthMonitor = new HealthMonitor();
    const denied = vi.fn(async (): Promise<RatingData | null> => {
      throw new ProviderError(
        ProviderErrorCode.ENTITLEMENT_REQUIRED,
        "plan does not include ratings",
        false,
      );
    });
    const agg = await aggregatorOver(
      installProviders({ p1: { fetchRatings: denied } }),
      { healthMonitor },
    );

    for (let i = 0; i < 10; i++) await agg.fetchRatings("AAPL");

    const metrics = healthMonitor.getMetrics("p1")!;
    expect(denied).toHaveBeenCalledTimes(10); // the breaker never opened
    expect(metrics.failureCount).toBe(10); // still a real, failed attempt
    expect(metrics.entitlementDenials).toBe(10);
    expect(metrics.consecutiveFailures).toBe(0);
    expect(new FailureDetector().shouldDisableProvider(metrics)).toBe(false);
  });

  it("reports elapsed latency for a provider that has only failed", async () => {
    const healthMonitor = new HealthMonitor();
    const slowFailure = vi.fn(async (): Promise<RatingData | null> => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      throw new Error("down");
    });
    const agg = await aggregatorOver(
      installProviders({ p1: { fetchRatings: slowFailure } }),
      { healthMonitor },
    );

    await agg.fetchRatings("AAPL");

    expect(agg.getProviderHealth("p1").avgLatency).toBeGreaterThanOrEqual(15);
  });

  it("labels a provider with no attempts as registry-default", async () => {
    const agg = await aggregatorOver(installProviders({ p1: {} }));

    expect(agg.getProviderHealth("never-called")).toMatchObject({
      provenance: "registry-default",
    });
  });
});

describe("health persistence", () => {
  const rating: RatingData = { consensus: "buy", numberOfAnalysts: 3 };

  function wired(
    fetchRatings: MarketDataProvider["fetchRatings"],
    healthStore: HealthMetricsStore,
  ) {
    return createAggregator({
      healthStore,
      configStore: new InMemoryConfigStore(
        installProviders({ p1: { fetchRatings } }),
      ),
      credentials: { resolve: async () => null },
    });
  }

  it("persists real counts and elapsed latency for every attempt", async () => {
    const healthStore = new InMemoryHealthStore();
    const fetchRatings = vi
      .fn<() => Promise<RatingData | null>>()
      .mockImplementationOnce(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        return rating;
      })
      .mockRejectedValueOnce(new Error("down"));
    const { service, healthRepository } = wired(fetchRatings, healthStore);

    await service.getRatings("AAPL");
    await service.getRatings("AAPL", "system", { forceRefresh: true });

    const [latest, earlier] = await healthRepository.getRecentMetrics("p1", 5);
    expect(earlier).toMatchObject({ successCount: 1, failureCount: 0, status: "enabled" });
    expect(earlier?.avgLatencyMs).toBeGreaterThanOrEqual(15);
    expect(latest).toMatchObject({ successCount: 1, failureCount: 1, consecutiveFailures: 1 });
    expect(latest?.lastFailureAt).toBeInstanceOf(Date);
  });

  it("keeps serving data when the health store is unavailable", async () => {
    const brokenStore = new InMemoryHealthStore();
    vi.spyOn(brokenStore, "insertHealthMetric").mockRejectedValue(new Error("disk full"));
    const { service } = wired(vi.fn(async () => rating), brokenStore);

    expect((await service.getRatings("AAPL")).data).toEqual(rating);
  });

  it("redacts credentials from recorded health errors", async () => {
    const healthMonitor = new HealthMonitor();
    const agg = await aggregatorOver(
      installProviders({
        p1: {
          fetchRatings: vi.fn(async () => {
            throw new Error("GET https://x.test/r?apikey=synthetic-secret failed");
          }),
        },
      }),
      { healthMonitor },
    );

    await agg.fetchRatings("AAPL");

    const [attempt] = healthMonitor.getRecentRequests("p1");
    expect(attempt?.error).toContain("failed");
    expect(attempt?.error).not.toContain("synthetic-secret");
  });
});
