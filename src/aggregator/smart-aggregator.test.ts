import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SmartAggregator } from "./smart-aggregator.js";
import { ProviderFactory } from "../providers/provider-factory.js";
import { ProviderRegistry } from "../config/provider-registry.js";
import { InMemoryConfigStore } from "../adapters/stores/in-memory-config-store.js";
import type { ProviderConfigRecord } from "../ports/config-store.js";
import type { CredentialProvider } from "../ports/credential-provider.js";
import type {
  MarketDataProvider,
  QuoteData,
  DataType,
  RateLimitConfig,
} from "../types/index.js";

function cfg(name: string, priority: number): ProviderConfigRecord {
  return {
    name,
    providerType: "rest",
    requiresKey: false,
    rateLimitPerMinute: null,
    rateLimitPerDay: null,
    reliabilityScore: 5,
    enabled: true,
    paidTier: false,
    supportedDataTypes: ["prices"],
    priority,
  };
}

function fakeProvider(
  name: string,
  fetchQuote: (symbol: string) => Promise<QuoteData | null>,
): MarketDataProvider {
  const supportedDataTypes: DataType[] = ["prices"];
  const rateLimit: RateLimitConfig = { requestsPerMinute: 60 };
  return { name, supportedDataTypes, rateLimit, fetchQuote };
}

function quote(price: number): QuoteData {
  return {
    symbol: "AAPL",
    price,
    timestamp: new Date(0),
    currency: "USD",
  } as QuoteData;
}

const noCreds: CredentialProvider = { resolve: async () => null };

async function buildAggregator(
  configs: ProviderConfigRecord[],
  credentials: CredentialProvider = noCreds,
): Promise<SmartAggregator> {
  const registry = new ProviderRegistry(new InMemoryConfigStore(configs));
  await registry.load();
  return new SmartAggregator({ registry, credentials });
}

describe("SmartAggregator", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("falls back to the next provider when the first returns null", async () => {
    const p1 = vi.fn(async () => null);
    const p2 = vi.fn(async () => quote(42));
    vi.spyOn(ProviderFactory, "create").mockImplementation((name) => {
      if (name === "p1") return fakeProvider("p1", p1);
      if (name === "p2") return fakeProvider("p2", p2);
      return null;
    });

    const agg = await buildAggregator([cfg("p1", 1), cfg("p2", 2)]);
    const result = await agg.fetchQuote("AAPL");

    expect(result?.price).toBe(42);
    expect(p1).toHaveBeenCalledTimes(1);
    expect(p2).toHaveBeenCalledTimes(1);
  });

  it("skips providers that require a key when none is resolved", async () => {
    const p1 = vi.fn(async () => quote(1));
    const p2 = vi.fn(async () => quote(2));
    vi.spyOn(ProviderFactory, "create").mockImplementation((name) =>
      name === "p1"
        ? fakeProvider("p1", p1)
        : name === "p2"
          ? fakeProvider("p2", p2)
          : null,
    );

    // p1 requires a key; credential provider returns none → p1 skipped.
    const agg = await buildAggregator([
      { ...cfg("p1", 1), requiresKey: true },
      cfg("p2", 2),
    ]);
    const result = await agg.fetchQuote("AAPL");

    expect(result?.price).toBe(2);
    expect(p1).not.toHaveBeenCalled();
    expect(p2).toHaveBeenCalledTimes(1);
  });

  it("returns null when every provider yields null", async () => {
    vi.spyOn(ProviderFactory, "create").mockImplementation((name) =>
      fakeProvider(name, async () => null),
    );
    const agg = await buildAggregator([cfg("p1", 1)]);
    expect(await agg.fetchQuote("AAPL")).toBeNull();
  });

  it("opens the circuit breaker after repeated failures and stops calling", async () => {
    const failing = vi.fn(async () => {
      throw new Error("provider down");
    });
    vi.spyOn(ProviderFactory, "create").mockImplementation((name) =>
      fakeProvider(name, failing),
    );
    const agg = await buildAggregator([cfg("p1", 1)]);

    // Breaker trips after 5 failures; subsequent calls short-circuit.
    for (let i = 0; i < 6; i++) await agg.fetchQuote("AAPL");
    const callsAfterTrip = failing.mock.calls.length;
    await agg.fetchQuote("AAPL");
    expect(failing.mock.calls.length).toBe(callsAfterTrip); // no new call
  });
});
