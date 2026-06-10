import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AlpacaProvider } from "../alpaca.js";

describe("AlpacaProvider — historical & health", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      } as Response),
    );
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const validCredentials = {
    api_key: "test-key-id",
    api_secret: "test-secret-key",
  };

  describe("fetchHistoricalPrices", () => {
    const barsResponse = {
      bars: [
        { t: "2026-03-25T04:00:00Z", o: 145, h: 148, l: 144, c: 147, v: 1000000 },
        { t: "2026-03-26T04:00:00Z", o: 147, h: 150, l: 146, c: 149, v: 1200000 },
      ],
      next_page_token: null,
    };

    it("should return HistoricalPrice[] for valid request", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(barsResponse),
      });

      const provider = new AlpacaProvider(validCredentials);
      const result = await provider.fetchHistoricalPrices(
        "AAPL",
        new Date("2026-03-25"),
        new Date("2026-03-27"),
      );

      expect(result).toHaveLength(2);
      expect(result[0]!.date).toBe("2026-03-25");
      expect(result[0]!.close).toBe(147);
      expect(result[1]!.date).toBe("2026-03-26");
      expect(result[1]!.volume).toBe(1200000);
    });

    it("should throw AUTHENTICATION_FAILED on 401", async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 401 });

      const provider = new AlpacaProvider(validCredentials);

      await expect(
        provider.fetchHistoricalPrices(
          "AAPL",
          new Date("2026-03-01"),
          new Date("2026-03-28"),
        ),
      ).rejects.toThrow("Alpaca authentication failed");
    });

    it("should return empty array on 403", async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 403 });

      const provider = new AlpacaProvider(validCredentials);
      const result = await provider.fetchHistoricalPrices(
        "AAPL",
        new Date("2026-03-01"),
        new Date("2026-03-28"),
      );

      expect(result).toEqual([]);
    });

    it("should return empty array on 422 (invalid symbol)", async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 422 });

      const provider = new AlpacaProvider(validCredentials);
      const result = await provider.fetchHistoricalPrices(
        "INVALID",
        new Date("2026-03-01"),
        new Date("2026-03-28"),
      );

      expect(result).toEqual([]);
    });

    it("should handle empty bars response", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ bars: [], next_page_token: null }),
      });

      const provider = new AlpacaProvider(validCredentials);
      const result = await provider.fetchHistoricalPrices(
        "AAPL",
        new Date("2026-03-01"),
        new Date("2026-03-28"),
      );

      expect(result).toEqual([]);
    });

    it("should include feed=iex in URL params", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ bars: [], next_page_token: null }),
      });

      const provider = new AlpacaProvider(validCredentials);
      await provider.fetchHistoricalPrices(
        "AAPL",
        new Date("2026-03-01"),
        new Date("2026-03-28"),
      );

      const calledUrl = fetchMock.mock.calls[0]![0] as string;
      expect(calledUrl).toContain("feed=iex");
      expect(calledUrl).toContain("timeframe=1Day");
    });
  });

  describe("healthCheck", () => {
    it("should return true when API is accessible", async () => {
      fetchMock.mockResolvedValue({ ok: true, status: 200 });

      const provider = new AlpacaProvider(validCredentials);
      const result = await provider.healthCheck();

      expect(result).toBe(true);
    });

    it("should return false on error", async () => {
      fetchMock.mockRejectedValue(new Error("Network error"));

      const provider = new AlpacaProvider(validCredentials);
      const result = await provider.healthCheck();

      expect(result).toBe(false);
    });

    it("should return false on non-ok response", async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 401 });

      const provider = new AlpacaProvider(validCredentials);
      const result = await provider.healthCheck();

      expect(result).toBe(false);
    });
  });
});
