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
    expect(p.supportedDataTypes).toEqual(["prices"]);
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
});
