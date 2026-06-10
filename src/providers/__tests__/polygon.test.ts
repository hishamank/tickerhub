import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProviderError, ProviderErrorCode } from "../../types/provider.js";
import { PolygonProvider } from "../polygon.js";

describe("PolygonProvider", () => {
  let provider: PolygonProvider;
  let originalFetch: typeof globalThis.fetch | undefined;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalFetch) {
      globalThis.fetch = originalFetch;
    }
  });

  it("normalizes quote data from the snapshot endpoint", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        ticker: {
          day: { o: 180, h: 183, l: 179, c: 182, v: 1200 },
          prevDay: { c: 178 },
          lastTrade: { p: 182.5, t: 1711651200000000000 },
        },
      }),
    } as unknown as Response);

    provider = new PolygonProvider({ api_key: "polygon-key" });
    const quote = await provider.fetchQuote("aapl");

    expect(quote).toMatchObject({
      symbol: "AAPL",
      price: 182.5,
      open: 180,
      high: 183,
      low: 179,
      previousClose: 178,
      volume: 1200,
      currency: "USD",
    });
    expect(quote?.change).toBeCloseTo(4.5);
    expect(quote?.changePercent).toBeCloseTo(2.5280898876);
  });

  it("encodes the API key with URLSearchParams", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ ticker: {} }),
    } as unknown as Response);
    globalThis.fetch = fetchMock;

    provider = new PolygonProvider({ api_key: "key+with/slash==" });
    await provider.fetchQuote("AAPL");

    expect(fetchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        searchParams: expect.objectContaining({
          get: expect.any(Function),
        }),
      }),
    );
    const calledUrl = fetchMock.mock.calls[0]?.[0];
    expect(calledUrl instanceof URL).toBe(true);
    expect((calledUrl as URL).searchParams.get("apiKey")).toBe("key+with/slash==");
  });

  it("returns null when the snapshot payload has no usable price", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ ticker: {} }),
    } as unknown as Response);

    provider = new PolygonProvider({ api_key: "polygon-key" });

    await expect(provider.fetchQuote("AAPL")).resolves.toBeNull();
  });

  it("normalizes historical aggregates into daily prices", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        results: [
          { t: 1711584000000, o: 180, h: 181, l: 178, c: 180.5, v: 1000 },
          { t: 1711670400000, o: 181, h: 183, l: 180, c: 182.25, v: 1100 },
        ],
      }),
    } as unknown as Response);

    provider = new PolygonProvider({ api_key: "polygon-key" });
    const prices = await provider.fetchHistoricalPrices(
      "AAPL",
      new Date("2024-03-28"),
      new Date("2024-03-29"),
    );

    expect(prices).toEqual([
      {
        date: "2024-03-28",
        close: 180.5,
        volume: 1000,
        open: 180,
        high: 181,
        low: 178,
      },
      {
        date: "2024-03-29",
        close: 182.25,
        volume: 1100,
        open: 181,
        high: 183,
        low: 180,
      },
    ]);
  });

  it("normalizes dividends and maps frequency metadata", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        results: [
          {
            ex_dividend_date: "2024-03-01",
            pay_date: "2024-03-15",
            record_date: "2024-03-04",
            declaration_date: "2024-02-20",
            cash_amount: 0.24,
            currency: "USD",
            frequency: 4,
          },
        ],
      }),
    } as unknown as Response);

    provider = new PolygonProvider({ api_key: "polygon-key" });
    const dividends = await provider.fetchDividends("MSFT");

    expect(dividends).toHaveLength(1);
    expect(dividends[0]).toMatchObject({
      amount: 0.24,
      currency: "USD",
      frequency: "quarterly",
    });
    expect(dividends[0]?.exDate.toISOString()).toContain("2024-03-01");
  });

  it("normalizes split events and detects reverse splits", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        results: [
          { execution_date: "2024-06-10", split_from: 1, split_to: 4, ticker: "NVDA" },
          { execution_date: "2024-07-01", split_from: 10, split_to: 1, ticker: "XYZ" },
        ],
      }),
    } as unknown as Response);

    provider = new PolygonProvider({ api_key: "polygon-key" });
    const events = await provider.fetchEvents("NVDA");

    expect(events).toEqual([
      {
        type: "split",
        date: new Date("2024-06-10"),
        description: "Stock split for NVDA",
        details: { ratio: "4:1", ticker: "NVDA" },
      },
      {
        type: "reverse_split",
        date: new Date("2024-07-01"),
        description: "Stock split for NVDA",
        details: { ratio: "1:10", ticker: "XYZ" },
      },
    ]);
  });

  it("throws a retryable rate limit error on HTTP 429", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
    } as Response);

    provider = new PolygonProvider({ api_key: "polygon-key" });

    await expect(provider.fetchQuote("AAPL")).rejects.toBeInstanceOf(
      ProviderError,
    );
  });

  it("throws an authentication error on HTTP 403", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
    } as Response);

    provider = new PolygonProvider({ api_key: "polygon-key" });

    await expect(provider.fetchDividends("AAPL")).rejects.toBeInstanceOf(
      ProviderError,
    );
  });

  it("maps HTTP 404 to a non-retryable symbol-not-found error", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    } as Response);

    provider = new PolygonProvider({ api_key: "polygon-key" });

    await expect(provider.fetchQuote("MISSING")).rejects.toMatchObject({
      code: ProviderErrorCode.SYMBOL_NOT_FOUND,
      retryable: false,
    });
  });
});
