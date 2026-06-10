import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the yahoo-finance2 library before importing the provider. The provider
// instantiates the default export at module load, so the mock must supply a
// class whose instances expose the methods we control.
const { quoteFn, historicalFn } = vi.hoisted(() => ({
  quoteFn: vi.fn(),
  historicalFn: vi.fn(),
}));
vi.mock("yahoo-finance2", () => ({
  default: class {
    quote = quoteFn;
    historical = historicalFn;
  },
}));

import { YahooFinanceProvider } from "../yahoo-finance.js";

describe("YahooFinanceProvider", () => {
  beforeEach(() => {
    quoteFn.mockReset();
    historicalFn.mockReset();
  });

  it("exposes correct metadata and needs no key", () => {
    const p = new YahooFinanceProvider();
    expect(p.name).toBe("yahoo-finance");
    expect(p.supportedDataTypes).toContain("prices");
  });

  it("fetches and maps a quote", async () => {
    quoteFn.mockResolvedValue({
      regularMarketPrice: 150,
      regularMarketOpen: 148,
      regularMarketDayHigh: 151,
      regularMarketDayLow: 147,
      regularMarketPreviousClose: 149,
      regularMarketVolume: 1000,
      regularMarketTime: new Date(0),
      currency: "USD",
    });
    const q = await new YahooFinanceProvider().fetchQuote("AAPL");
    expect(q.symbol).toBe("AAPL");
    expect(q.price).toBe(150);
    expect(q.volume).toBe(1000);
  });

  it("throws SYMBOL_NOT_FOUND when the price is invalid", async () => {
    quoteFn.mockResolvedValue({ regularMarketPrice: null });
    await expect(new YahooFinanceProvider().fetchQuote("ZZZZ")).rejects.toThrow(
      /not found|invalid price/i,
    );
  });

  it("maps historical prices", async () => {
    historicalFn.mockResolvedValue([
      {
        date: new Date("2024-01-02T00:00:00Z"),
        open: 148,
        high: 151,
        low: 147,
        close: 150,
        volume: 1000,
      },
    ]);
    const prices = await new YahooFinanceProvider().fetchHistoricalPrices!(
      "AAPL",
      new Date("2024-01-01"),
      new Date("2024-01-03"),
    );
    expect(prices).toHaveLength(1);
    expect(prices[0]?.close).toBe(150);
    expect(prices[0]?.date).toBe("2024-01-02");
  });
});
