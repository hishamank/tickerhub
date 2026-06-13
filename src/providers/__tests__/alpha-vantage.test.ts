import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AlphaVantageProvider } from "../alpha-vantage.js";

const creds = { api_key: "test-key" };

describe("AlphaVantageProvider", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("requires an API key", () => {
    expect(() => new AlphaVantageProvider(null)).toThrow(/api key/i);
  });

  it("exposes correct metadata", () => {
    const p = new AlphaVantageProvider(creds);
    expect(p.name).toBe("alpha-vantage");
    expect(p.supportedDataTypes).toContain("prices");
    expect(p.supportedDataTypes).toContain("technicals");
    expect(p.supportedDataTypes).toContain("forex_rate");
  });

  it("fetches and maps a Global Quote", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        "Global Quote": {
          "05. price": "150.00",
          "02. open": "148.00",
          "03. high": "151.00",
          "04. low": "147.00",
          "08. previous close": "149.00",
          "09. change": "1.00",
          "10. change percent": "0.67%",
          "06. volume": "1000",
          "07. latest trading day": "2024-01-02",
        },
      }),
    } as Response);
    const q = await new AlphaVantageProvider(creds).fetchQuote("AAPL");
    expect(q?.price).toBe(150);
    expect(q?.changePercent).toBeCloseTo(0.67);
    expect(q?.volume).toBe(1000);
  });

  it("throws SYMBOL_NOT_FOUND when Global Quote is empty", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ "Global Quote": {} }),
    } as Response);
    await expect(
      new AlphaVantageProvider(creds).fetchQuote("ZZZZ"),
    ).rejects.toThrow(/not found/i);
  });

  it("maps quarterly earnings", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        quarterlyEarnings: [
          {
            fiscalDateEnding: "2024-03-31",
            reportedDate: "2024-04-25",
            estimatedEPS: "1.50",
            reportedEPS: "1.55",
            surprise: "0.05",
            surprisePercentage: "3.33",
          },
        ],
      }),
    } as Response);
    const earnings = await new AlphaVantageProvider(creds).fetchEarnings!(
      "AAPL",
    );
    expect(earnings).toHaveLength(1);
    expect(earnings[0]?.fiscalYear).toBe(2024);
    expect(earnings[0]?.actual).toBe(1.55);
  });

  it("maps a technical indicator series", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        "Meta Data": { "1: Symbol": "AAPL" },
        "Technical Analysis: SMA": {
          "2024-01-02": { SMA: "150.0" },
          "2024-01-01": { SMA: "149.0" },
        },
      }),
    } as Response);
    const ti = await new AlphaVantageProvider(creds).fetchTechnicalIndicator!(
      "AAPL",
      "SMA",
    );
    expect(ti?.indicator).toBe("sma");
    expect(ti?.values).toHaveLength(2);
    expect(ti?.values[0]?.value).toBe(150);
  });

  it("maps a forex exchange rate", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        "Realtime Currency Exchange Rate": {
          "5. Exchange Rate": "1.0850",
          "6. Last Refreshed": "2024-01-02 12:00:00",
          "8. Bid Price": "1.0849",
          "9. Ask Price": "1.0851",
        },
      }),
    } as Response);
    const rate = await new AlphaVantageProvider(creds).fetchForexRate!(
      "EUR",
      "USD",
    );
    expect(rate?.rate).toBeCloseTo(1.085);
    expect(rate?.from).toBe("EUR");
  });

  it("maps forex historical prices within the range", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        "Time Series FX (Daily)": {
          "2024-01-02": {
            "1. open": "1.080",
            "2. high": "1.090",
            "3. low": "1.070",
            "4. close": "1.085",
          },
          "2023-12-01": {
            "1. open": "1.000",
            "2. high": "1.010",
            "3. low": "0.990",
            "4. close": "1.005",
          },
        },
      }),
    } as Response);
    const hist = await new AlphaVantageProvider(creds).fetchForexHistorical!(
      "EUR",
      "USD",
      new Date("2024-01-01"),
      new Date("2024-01-03"),
    );
    expect(hist).toHaveLength(1); // 2023-12-01 is filtered out of range
    expect(hist[0]?.date).toBe("2024-01-02");
    expect(hist[0]?.close).toBeCloseTo(1.085);
  });
});
