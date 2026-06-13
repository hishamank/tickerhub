import { describe, it, expect, vi } from "vitest";
import { ProviderAggregatorService } from "./provider-aggregator.service.js";
import { SwrCache } from "../cache/swr-cache.js";
import { InMemoryCache } from "../adapters/cache/in-memory-cache.js";
import type { SmartAggregator } from "../aggregator/smart-aggregator.js";
import type { QuoteData, DividendData } from "../types/index.js";

function build(overrides: Partial<SmartAggregator> = {}) {
  const aggregator = {
    fetchQuote: vi.fn(async (): Promise<QuoteData | null> => ({
      symbol: "AAPL",
      price: 1,
      timestamp: new Date(0),
      currency: "USD",
    })),
    fetchDividends: vi.fn(async (): Promise<DividendData[]> => []),
    getProviderHealth: vi.fn(() => ({
      status: "enabled" as const,
      successRate: 1,
      avgLatency: 0,
    })),
    getRegisteredProviders: vi.fn(async () => ["finnhub"]),
    resetRateLimits: vi.fn(),
    ...overrides,
  } as unknown as SmartAggregator;
  const cache = new SwrCache(new InMemoryCache());
  return { service: new ProviderAggregatorService(aggregator, cache), aggregator };
}

describe("ProviderAggregatorService", () => {
  it("returns a quote and caches it (second call is a cache hit)", async () => {
    const { service, aggregator } = build();
    const first = await service.getQuote("AAPL");
    expect(first.data?.price).toBe(1);
    expect(first.metadata.source).toBe("provider");

    const second = await service.getQuote("AAPL");
    expect(second.metadata.source).toBe("cache");
    expect(aggregator.fetchQuote).toHaveBeenCalledTimes(1);
  });

  it("forceRefresh bypasses the cache", async () => {
    const { service, aggregator } = build();
    await service.getQuote("AAPL");
    await service.getQuote("AAPL", "system", { forceRefresh: true });
    expect(aggregator.fetchQuote).toHaveBeenCalledTimes(2);
  });

  it("invalidateSymbol clears cached data", async () => {
    const { service, aggregator } = build();
    await service.getQuote("AAPL");
    await service.invalidateSymbol("AAPL");
    await service.getQuote("AAPL");
    expect(aggregator.fetchQuote).toHaveBeenCalledTimes(2);
  });

  it("exposes a crypto namespace that aggregates and caches", async () => {
    const crypto = {
      fetchMarkets: vi.fn(async () => [{ symbol: "BTC", price: 42500, rank: 1 }]),
    };
    const { service } = build({
      crypto,
    } as unknown as Partial<SmartAggregator>);

    const first = await service.crypto.getMarkets(10);
    expect(first.data[0]?.symbol).toBe("BTC");
    expect(first.metadata.source).toBe("provider");

    const second = await service.crypto.getMarkets(10);
    expect(second.metadata.source).toBe("cache");
    expect(crypto.fetchMarkets).toHaveBeenCalledTimes(1);
  });

  it("exposes a forex namespace that aggregates and caches", async () => {
    const forex = {
      fetchRate: vi.fn(async () => ({
        from: "EUR",
        to: "USD",
        rate: 1.085,
        timestamp: new Date(0),
      })),
    };
    const { service } = build({ forex } as unknown as Partial<SmartAggregator>);

    const first = await service.forex.getRate("EUR", "USD");
    expect(first.data?.rate).toBe(1.085);
    expect(first.metadata.source).toBe("provider");

    const second = await service.forex.getRate("EUR", "USD");
    expect(second.metadata.source).toBe("cache");
    expect(forex.fetchRate).toHaveBeenCalledTimes(1);
  });

  it("delegates health, provider list, and rate-limit reset", async () => {
    const { service, aggregator } = build();
    expect(service.getProviderHealth("finnhub").status).toBe("enabled");
    expect(await service.getRegisteredProviders()).toEqual(["finnhub"]);
    service.resetRateLimits();
    expect(aggregator.resetRateLimits).toHaveBeenCalledOnce();
  });
});
