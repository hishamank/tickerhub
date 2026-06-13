import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FMPProvider } from "../fmp.js";

describe("FMPProvider", () => {
  let provider: FMPProvider;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let fetchMock: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let originalFetch: any;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve([]),
      } as Response),
    );
    globalThis.fetch = fetchMock;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalFetch !== undefined) {
      globalThis.fetch = originalFetch;
    }
  });

  describe("fetchQuote", () => {
    it("should return null on 403 response", async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 403,
      });

      provider = new FMPProvider({ api_key: "test-api-key" });
      const result = await provider.fetchQuote("AAPL");

      expect(result).toBeNull();
      expect(fetchMock).toHaveBeenCalled();
    });

    it("should throw on 401 (invalid API key)", async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 401,
      });

      provider = new FMPProvider({ api_key: "test-api-key" });

      await expect(provider.fetchQuote("AAPL")).rejects.toThrow();
    });

    it("should throw on 429 (rate limit)", async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 429,
      });

      provider = new FMPProvider({ api_key: "test-api-key" });

      await expect(provider.fetchQuote("AAPL")).rejects.toThrow();
    });
  });

  describe("fetchDividends", () => {
    it("should return empty array on 403 response", async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 403,
      });

      provider = new FMPProvider({ api_key: "test-api-key" });
      const result = await provider.fetchDividends("AAPL");

      expect(result).toEqual([]);
    });
  });

  describe("fetchEarnings", () => {
    it("should return empty array on 403 response", async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 403,
      });

      provider = new FMPProvider({ api_key: "test-api-key" });
      const result = await provider.fetchEarnings("AAPL");

      expect(result).toEqual([]);
    });
  });

  describe("fetchRatings", () => {
    it("should return null on 403 response", async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 403,
      });

      provider = new FMPProvider({ api_key: "test-api-key" });
      const result = await provider.fetchRatings("AAPL");

      expect(result).toBeNull();
    });

    it("should return null when no ratings data available", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue([]),
      });

      provider = new FMPProvider({ api_key: "test-api-key" });
      const result = await provider.fetchRatings("AAPL");

      expect(result).toBeNull();
    });
  });

  describe("fetchHistoricalPrices", () => {
    it("should return empty array on 403 response", async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 403,
      });

      provider = new FMPProvider({ api_key: "test-api-key" });
      const result = await provider.fetchHistoricalPrices(
        "AAPL",
        new Date("2024-01-01"),
        new Date("2024-01-31"),
      );

      expect(result).toEqual([]);
    });
  });

  describe("fetchProfile", () => {
    it("maps a company profile entry", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve([
            {
              symbol: "AAPL",
              companyName: "Apple Inc.",
              currency: "USD",
              exchangeShortName: "NASDAQ",
              industry: "Consumer Electronics",
              sector: "Technology",
              country: "US",
              website: "https://apple.com",
              ceo: "Tim Cook",
              fullTimeEmployees: "161000",
              image: "https://logo.png",
              ipoDate: "1980-12-12",
              mktCap: 3_000_000_000_000,
              address: "One Apple Park Way",
              city: "Cupertino",
              state: "CA",
            },
          ]),
      });
      provider = new FMPProvider({ api_key: "test-api-key" });
      const profile = await provider.fetchProfile!("AAPL");
      expect(profile?.name).toBe("Apple Inc.");
      expect(profile?.exchange).toBe("NASDAQ");
      expect(profile?.employees).toBe(161000);
      expect(profile?.marketCap).toBe(3_000_000_000_000);
      expect(profile?.address).toBe("One Apple Park Way, Cupertino, CA");
    });

    it("returns null profile on a 403 response", async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 403 });
      provider = new FMPProvider({ api_key: "test-api-key" });
      expect(await provider.fetchProfile!("AAPL")).toBeNull();
    });
  });

  describe("fetchMarketMovers", () => {
    it("maps gainers", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve([
            { symbol: "AAPL", name: "Apple", price: 180, change: 5, changesPercentage: 2.8 },
          ]),
      });
      provider = new FMPProvider({ api_key: "test-api-key" });
      const movers = await provider.fetchMarketMovers!("gainers");
      expect(movers[0]?.symbol).toBe("AAPL");
      expect(movers[0]?.changePercent).toBe(2.8);
    });
  });

  describe("fetchForexRate", () => {
    it("maps a forex quote into a rate", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve([{ symbol: "EURUSD", price: 1.085, bid: 1.0849, ask: 1.0851 }]),
      });
      provider = new FMPProvider({ api_key: "test-api-key" });
      const rate = await provider.fetchForexRate!("EUR", "USD");
      expect(rate?.from).toBe("EUR");
      expect(rate?.to).toBe("USD");
      expect(rate?.rate).toBe(1.085);
    });

    it("returns null when the pair is unknown", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve([]),
      });
      provider = new FMPProvider({ api_key: "test-api-key" });
      expect(await provider.fetchForexRate!("EUR", "ZZZ")).toBeNull();
    });
  });

  describe("healthCheck", () => {
    it("should return false on 403 response", async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 403,
      });

      provider = new FMPProvider({ api_key: "test-api-key" });
      const result = await provider.healthCheck();

      expect(result).toBe(false);
    });

    it("should return true when API is accessible", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
      });

      provider = new FMPProvider({ api_key: "test-api-key" });
      const result = await provider.healthCheck();

      expect(result).toBe(true);
    });
  });
});
