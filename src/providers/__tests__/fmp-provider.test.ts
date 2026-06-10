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
