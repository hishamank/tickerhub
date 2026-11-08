/**
 * Quota accounting regressions: FMP, Finnhub and Polygon spend one unit per real
 * HTTP attempt, checked before the request leaves. Real providers over fake HTTP;
 * all keys and payloads are synthetic.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SmartAggregator } from "./smart-aggregator.js";
import { ProviderFactory } from "../providers/provider-factory.js";
import { ProviderRegistry } from "../config/provider-registry.js";
import { BUILTIN_PROVIDERS } from "../config/default-priorities.js";
import { InMemoryConfigStore } from "../adapters/stores/in-memory-config-store.js";
import type { ProviderConfigRecord } from "../ports/config-store.js";
import { RateLimitTracker } from "../rate-limiting/tracker.js";
import { HealthMonitor } from "../health/health-monitor.js";
import { ProviderError, ProviderErrorCode } from "../types/provider.js";
import type { DataType, MarketDataProvider } from "../types/index.js";

const CREDS = { api_key: "synthetic-key" };
const TYPES: DataType[] = ["prices", "dividends", "events", "ratings"];
const UNUSED = -1; // getRemainingBudget's value for a window never recorded

let fetchMock: ReturnType<typeof vi.fn>;

function reply(status: number, body: unknown = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

const calledPath = (call: number) =>
  new URL(String(fetchMock.mock.calls[call]?.[0])).pathname;

function config(name: string, perMinute: number): ProviderConfigRecord {
  return {
    name,
    providerType: "rest",
    requiresKey: true,
    rateLimitPerMinute: perMinute,
    rateLimitPerHour: null,
    rateLimitPerDay: null,
    rateLimitPerMonth: null,
    reliabilityScore: 5,
    enabled: true,
    paidTier: false,
    supportedDataTypes: TYPES,
    priority: 1,
  };
}

/** A registry offering only `name`; the built-ins are merged in unless disabled. */
async function onlyProvider(name: string, perMinute: number) {
  const registry = new ProviderRegistry(
    new InMemoryConfigStore([
      config(name, perMinute),
      ...BUILTIN_PROVIDERS.filter((builtin) => builtin.name !== name).map(
        (builtin) => ({ ...config(builtin.name, perMinute), enabled: false }),
      ),
    ]),
  );
  await registry.load();
  return registry;
}

async function harness(name: string, perMinute: number) {
  const tracker = new RateLimitTracker();
  const healthMonitor = new HealthMonitor();
  const registry = await onlyProvider(name, perMinute);
  const aggregator = new SmartAggregator({
    registry,
    credentials: { resolve: async () => CREDS },
    rateLimitTracker: tracker,
    healthMonitor,
  });
  return {
    aggregator,
    healthMonitor,
    remaining: () => tracker.getRemainingBudget(CREDS, name).minute,
  };
}

const PREV_BAR = { o: 180, h: 183, l: 179, c: 182, v: 1200, t: 1_711_584_000_000 };
const RECOMMENDATION = [
  { buy: 3, hold: 1, sell: 0, strongBuy: 1, strongSell: 0, period: "2024-03-01" },
];

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Polygon quote fallback", () => {
  it("spends one unit for each of the snapshot 403 and the prev 200", async () => {
    fetchMock
      .mockResolvedValueOnce(reply(403))
      .mockResolvedValueOnce(reply(200, { results: [PREV_BAR] }));
    const { aggregator, remaining } = await harness("polygon", 5);

    const quote = await aggregator.fetchQuote("AAPL");

    expect(quote?.priceBasis).toBe("end_of_day");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(remaining()).toBe(3);
  });

  it("with one unit left, sends the snapshot but blocks prev before HTTP", async () => {
    fetchMock.mockResolvedValueOnce(reply(403));
    const { aggregator, remaining, healthMonitor } = await harness("polygon", 1);

    const quote = await aggregator.fetchQuote("AAPL");

    expect(quote).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(calledPath(0)).toContain("/v2/snapshot/");
    expect(remaining()).toBe(0);
    // Our own refusal says nothing about the provider's health.
    expect(healthMonitor.getRecentRequests("polygon")).toHaveLength(0);
  });

  it("spends nothing once the circuit is open", async () => {
    fetchMock.mockImplementation(async () => reply(500));
    const { aggregator, remaining } = await harness("polygon", 20);

    for (let i = 0; i < 5; i++) await aggregator.fetchQuote("AAPL");
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(remaining()).toBe(15);

    await aggregator.fetchQuote("AAPL");

    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(remaining()).toBe(15);
  });

  it("spends nothing when a symbol is rejected before any request", async () => {
    const { aggregator, remaining } = await harness("polygon", 5);

    await aggregator.fetchDividends("NOT A SYMBOL!");

    expect(fetchMock).not.toHaveBeenCalled();
    expect(remaining()).toBe(UNUSED);
  });

  it("keeps concurrent requests on separate keys in separate budgets", async () => {
    fetchMock.mockImplementation(async () => reply(500));
    const tracker = new RateLimitTracker();
    const aggregator = new SmartAggregator({
      registry: await onlyProvider("polygon", 5),
      credentials: {
        resolve: async (_name, userId) => ({ api_key: userId ?? "system" }),
      },
      rateLimitTracker: tracker,
    });

    await Promise.all([
      aggregator.fetchDividends("AAPL", "alice"),
      aggregator.fetchDividends("AAPL", "alice"),
      aggregator.fetchDividends("AAPL", "bob"),
    ]);

    const left = (key: string) =>
      tracker.getRemainingBudget({ api_key: key }, "polygon").minute;
    expect(left("alice")).toBe(3);
    expect(left("bob")).toBe(4);
  });
});

describe("FMP", () => {
  it.each([
    ["an HTTP 500", () => fetchMock.mockResolvedValueOnce(reply(500))],
    ["a network failure", () => fetchMock.mockRejectedValueOnce(new Error("socket hang up"))],
  ])("spends one unit for %s", async (_label, arrange) => {
    arrange();
    const { aggregator, remaining } = await harness("fmp", 5);

    expect(await aggregator.fetchDividends("AAPL")).toEqual([]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(remaining()).toBe(4);
  });

  it("spends nothing for a capability it does not implement", async () => {
    const { aggregator, remaining } = await harness("fmp", 5);

    await aggregator.fetchEvents("AAPL");

    expect(fetchMock).not.toHaveBeenCalled();
    expect(remaining()).toBe(UNUSED);
  });
});

describe("Finnhub ratings", () => {
  it("spends a second unit on the optional price target", async () => {
    fetchMock
      .mockResolvedValueOnce(reply(200, RECOMMENDATION))
      .mockResolvedValueOnce(reply(200, { targetHigh: 200, targetLow: 150, targetMean: 175 }));
    const { aggregator, remaining } = await harness("finnhub", 5);

    expect(await aggregator.fetchRatings("AAPL")).not.toBeNull();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(remaining()).toBe(3);
  });

  it("still spends the second unit when the target is denied by plan", async () => {
    fetchMock
      .mockResolvedValueOnce(reply(200, RECOMMENDATION))
      .mockResolvedValueOnce(reply(403));
    const { aggregator, remaining } = await harness("finnhub", 5);

    expect(await aggregator.fetchRatings("AAPL")).not.toBeNull();

    expect(remaining()).toBe(3);
  });

  it("keeps the paid-for recommendation when no unit is left for the target", async () => {
    fetchMock.mockResolvedValueOnce(reply(200, RECOMMENDATION));
    const { aggregator, remaining } = await harness("finnhub", 1);

    const rating = await aggregator.fetchRatings("AAPL");

    expect(rating).not.toBeNull();
    expect(rating?.targetPrice).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(calledPath(0)).toContain("/stock/recommendation");
    expect(remaining()).toBe(0);
  });
});

describe("providers without per-request metering", () => {
  async function legacyHarness(fetchRatings: MarketDataProvider["fetchRatings"]) {
    vi.spyOn(ProviderFactory, "create").mockImplementation(
      (name) =>
        ({
          name,
          supportedDataTypes: TYPES,
          rateLimit: { requestsPerMinute: 60 },
          fetchQuote: async () => null,
          fetchRatings,
        }) as MarketDataProvider,
    );
    return harness("legacy", 20);
  }
  const rating = { consensus: "buy" as const, numberOfAnalysts: 3 };

  it("counts one logical unit per successful call", async () => {
    const { aggregator, remaining } = await legacyHarness(async () => rating);

    await aggregator.fetchRatings("AAPL");

    expect(remaining()).toBe(19);
  });

  it("counts a thrown attempt, but not an open-circuit short-circuit", async () => {
    const failing = vi.fn(async () => {
      throw new Error("down");
    });
    const { aggregator, remaining } = await legacyHarness(failing);

    for (let i = 0; i < 7; i++) await aggregator.fetchRatings("AAPL");

    expect(failing).toHaveBeenCalledTimes(5); // the breaker opens at 5 failures
    expect(remaining()).toBe(15);
  });

  it("does not count a request rejected as invalid before it was sent", async () => {
    const { aggregator, remaining } = await legacyHarness(async () => {
      throw new ProviderError(ProviderErrorCode.INVALID_REQUEST, "bad symbol", false);
    });

    await aggregator.fetchRatings("AAPL");

    expect(remaining()).toBe(UNUSED);
  });
});
