import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CoinGeckoProvider } from "../coingecko.js";

describe("CoinGeckoProvider", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  const provider = () => new CoinGeckoProvider(null, { rateLimitDelayMs: 0 });

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("exposes correct metadata", () => {
    const p = provider();
    expect(p.name).toBe("coingecko");
    expect(p.supportedDataTypes).toContain("prices");
    expect(p.supportedDataTypes).toContain("crypto_markets");
  });

  it("throws SYMBOL_NOT_FOUND for an unsupported symbol without calling fetch", async () => {
    await expect(provider().fetchQuote("NOTACOIN")).rejects.toThrow(
      /not supported/i,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetches and maps a crypto quote", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ bitcoin: { usd: 50000, usd_24h_change: 10 } }),
    } as Response);
    const q = await provider().fetchQuote("BTC");
    expect(q.symbol).toBe("BTC");
    expect(q.price).toBe(50000);
    expect(q.changePercent).toBe(10);
    expect(q.currency).toBe("USD");
  });

  it("maps HTTP 429 to RATE_LIMIT_EXCEEDED", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      statusText: "Too Many Requests",
    } as Response);
    await expect(provider().fetchQuote("BTC")).rejects.toThrow(/rate limit/i);
  });

  it("fetches batch quotes for supported symbols only", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        bitcoin: { usd: 50000, usd_24h_change: 1 },
        ethereum: { usd: 3000, usd_24h_change: -2 },
      }),
    } as Response);
    const map = await provider().fetchBatchQuotes(["BTC", "ETH", "NOTACOIN"]);
    expect(map.get("BTC")?.price).toBe(50000);
    expect(map.get("ETH")?.price).toBe(3000);
    expect(map.has("NOTACOIN")).toBe(false);
  });

  it("healthCheck returns true when ping succeeds", async () => {
    fetchMock.mockResolvedValue({ ok: true } as Response);
    expect(await provider().healthCheck()).toBe(true);
  });

  it("maps crypto OHLC history within the date range", async () => {
    const ts = Date.UTC(2024, 0, 2);
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [[ts, 42000, 43000, 41000, 42500]],
    } as Response);
    const hist = await provider().fetchCryptoHistorical(
      "BTC",
      new Date("2024-01-01"),
      new Date("2024-01-03"),
    );
    expect(hist).toHaveLength(1);
    expect(hist[0]?.date).toBe("2024-01-02");
    expect(hist[0]?.close).toBe(42500);
  });

  it("returns empty history for an unsupported crypto symbol", async () => {
    const hist = await provider().fetchCryptoHistorical(
      "NOTACOIN",
      new Date("2024-01-01"),
      new Date("2024-01-03"),
    );
    expect(hist).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps ranked crypto markets", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [
        {
          symbol: "btc",
          name: "Bitcoin",
          current_price: 42500,
          market_cap: 800_000_000_000,
          total_volume: 20_000_000_000,
          price_change_percentage_24h: 1.5,
          market_cap_rank: 1,
        },
      ],
    } as Response);
    const markets = await provider().fetchCryptoMarkets(10);
    expect(markets[0]?.symbol).toBe("BTC");
    expect(markets[0]?.rank).toBe(1);
    expect(markets[0]?.price).toBe(42500);
  });

  it("does not send a Demo key header when keyless", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ bitcoin: { usd: 50000, usd_24h_change: 1 } }),
    } as Response);
    await provider().fetchQuote("BTC");
    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Record<
      string,
      string
    >;
    expect(headers["x-cg-demo-api-key"]).toBeUndefined();
  });

  it("sends the x-cg-demo-api-key header when a Demo key is provided", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ bitcoin: { usd: 50000, usd_24h_change: 1 } }),
    } as Response);
    const keyed = new CoinGeckoProvider(
      { api_key: "demo-123" },
      { rateLimitDelayMs: 0 },
    );
    await keyed.fetchQuote("BTC");
    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Record<
      string,
      string
    >;
    expect(headers["x-cg-demo-api-key"]).toBe("demo-123");
  });
});
