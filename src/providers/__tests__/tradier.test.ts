import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProviderErrorCode } from "../../types/provider.js";
import { TradierProvider } from "../tradier.js";

describe("TradierProvider", () => {
  let provider: TradierProvider;
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

  it("normalizes delayed quote data", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          quotes: {
            quote: {
              symbol: "AAPL",
              last: "182.50",
              prevclose: "180.00",
              open: "181.00",
              high: "183.20",
              low: "179.80",
              volume: "1200",
              trade_date: 1711651200,
            },
          },
        }),
        { status: 200 },
      ),
    );

    provider = new TradierProvider({ api_key: "tradier-key" });
    const quote = await provider.fetchQuote("aapl");

    expect(quote).toMatchObject({
      symbol: "AAPL",
      price: 182.5,
      previousClose: 180,
      open: 181,
      high: 183.2,
      low: 179.8,
      volume: 1200,
      currency: "USD",
    });
    expect(quote?.change).toBeCloseTo(2.5);
    expect(quote?.changePercent).toBeCloseTo(1.3888888889);
  });

  it("normalizes historical prices", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          history: {
            day: [
              {
                date: "2024-03-28",
                open: "180.00",
                high: "181.00",
                low: "178.00",
                close: "180.50",
                volume: "1000",
              },
              {
                date: "2024-03-29",
                open: "181.00",
                high: "183.00",
                low: "180.00",
                close: "182.25",
                volume: "1100",
              },
            ],
          },
        }),
        { status: 200 },
      ),
    );

    provider = new TradierProvider({ api_key: "tradier-key" });
    const prices = await provider.fetchHistoricalPrices(
      "AAPL",
      new Date("2024-03-28"),
      new Date("2024-03-29"),
    );

    expect(prices).toEqual([
      {
        date: "2024-03-28",
        close: 180.5,
        open: 180,
        high: 181,
        low: 178,
        volume: 1000,
      },
      {
        date: "2024-03-29",
        close: 182.25,
        open: 181,
        high: 183,
        low: 180,
        volume: 1100,
      },
    ]);
  });

  it("normalizes an option chain and accepts a single-object payload", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          options: {
            option: {
              symbol: "AAPL240621C00180000",
              description: "AAPL Jun 21 2024 180 Call",
              option_type: "call",
              expiration_date: "2024-06-21",
              strike: "180",
              root_symbol: "AAPL",
              bid: "5.10",
              ask: "5.35",
              last: "5.20",
              change: "0.15",
              change_percentage: "2.97",
              volume: "250",
              open_interest: "1000",
              bid_size: "12",
              ask_size: "14",
              last_volume: "10",
              trade_date: 1711651200,
              greeks: {
                delta: "0.55",
                gamma: "0.02",
                theta: "-0.03",
                vega: "0.12",
                rho: "0.05",
                bid_iv: "0.21",
                mid_iv: "0.22",
                ask_iv: "0.23",
                smv_vol: "0.20",
              },
            },
          },
        }),
        { status: 200 },
      ),
    );

    provider = new TradierProvider({ api_key: "tradier-key" });
    const chain = await provider.fetchOptionChain(
      "AAPL",
      new Date("2024-06-21"),
    );

    expect(chain).toMatchObject({
      underlyingSymbol: "AAPL",
      options: [
        {
          symbol: "AAPL240621C00180000",
          underlyingSymbol: "AAPL",
          strike: 180,
          optionType: "call",
          bid: 5.1,
          ask: 5.35,
          last: 5.2,
          openInterest: 1000,
          greeks: {
            delta: 0.55,
            gamma: 0.02,
            theta: -0.03,
            vega: 0.12,
            rho: 0.05,
            bidIv: 0.21,
            midIv: 0.22,
            askIv: 0.23,
            smvVol: 0.2,
          },
        },
      ],
    });
  });

  it("returns null for an empty option chain", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          options: { option: null },
        }),
        { status: 200 },
      ),
    );

    provider = new TradierProvider({ api_key: "tradier-key" });

    await expect(
      provider.fetchOptionChain("AAPL", new Date("2024-06-21")),
    ).resolves.toBeNull();
  });

  it("does not invent option timestamps when Tradier omits trade_date", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          options: {
            option: {
              symbol: "AAPL240621P00175000",
              description: "AAPL Jun 21 2024 175 Put",
              option_type: "put",
              expiration_date: "2024-06-21",
              strike: "175",
              root_symbol: "AAPL",
              bid: "3.10",
              ask: "3.35",
              last: "3.20",
            },
          },
        }),
        { status: 200 },
      ),
    );

    provider = new TradierProvider({ api_key: "tradier-key" });
    const chain = await provider.fetchOptionChain(
      "AAPL",
      new Date("2024-06-21"),
    );

    expect(chain?.options[0]).toMatchObject({
      symbol: "AAPL240621P00175000",
      tradeDate: undefined,
      quoteDate: undefined,
    });
  });

  it("maps authentication failures", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response("forbidden", { status: 403 }),
    );

    provider = new TradierProvider({ api_key: "tradier-key" });

    await expect(provider.fetchQuote("AAPL")).rejects.toMatchObject({
      code: ProviderErrorCode.AUTHENTICATION_FAILED,
      retryable: false,
    });
  });

  it("maps rate limit failures as retryable", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response("slow down", { status: 429 }),
    );

    provider = new TradierProvider({ api_key: "tradier-key" });

    await expect(
      provider.fetchOptionChain("AAPL", new Date("2024-06-21")),
    ).rejects.toMatchObject({
      code: ProviderErrorCode.RATE_LIMIT_EXCEEDED,
      retryable: true,
    });
  });
});
