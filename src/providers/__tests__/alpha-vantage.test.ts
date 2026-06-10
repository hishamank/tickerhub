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
    expect(p.supportedDataTypes).toEqual(["prices", "dividends", "earnings"]);
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
});
