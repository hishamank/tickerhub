import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AlpacaProvider } from "../alpaca.js";

describe("AlpacaProvider", () => {
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

  describe("constructor", () => {
    it("should create instance with valid credentials", () => {
      const provider = new AlpacaProvider(validCredentials);
      expect(provider.name).toBe("alpaca");
      expect(provider.supportedDataTypes).toEqual(["prices"]);
    });

    it("should throw when api_key is missing", () => {
      expect(
        () => new AlpacaProvider({ api_secret: "secret" }),
      ).toThrow("Alpaca API key ID is required");
    });

    it("should throw when api_secret is missing", () => {
      expect(
        () => new AlpacaProvider({ api_key: "key-id" }),
      ).toThrow("Alpaca API secret key is required");
    });

    it("should throw when credentials are null", () => {
      expect(() => new AlpacaProvider(null)).toThrow(
        "Alpaca API key ID is required",
      );
    });
  });

  describe("fetchQuote", () => {
    const snapshotResponse = {
      latestTrade: { p: 150.25, t: "2026-03-28T20:00:00Z" },
      dailyBar: { o: 148.0, h: 151.5, l: 147.5, c: 150.0, v: 50000000 },
      prevDailyBar: { c: 149.0 },
    };

    it("should return QuoteData for valid symbol", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(snapshotResponse),
      });

      const provider = new AlpacaProvider(validCredentials);
      const result = await provider.fetchQuote("AAPL");

      expect(result).not.toBeNull();
      expect(result!.symbol).toBe("AAPL");
      expect(result!.price).toBe(150.25);
      expect(result!.open).toBe(148.0);
      expect(result!.high).toBe(151.5);
      expect(result!.low).toBe(147.5);
      expect(result!.previousClose).toBe(149.0);
      expect(result!.volume).toBe(50000000);
      expect(result!.currency).toBe("USD");
    });

    it("should compute change and changePercent", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(snapshotResponse),
      });

      const provider = new AlpacaProvider(validCredentials);
      const result = await provider.fetchQuote("AAPL");

      // price=150.25, previousClose=149.0 → change=1.25, changePercent≈0.8389
      expect(result!.change).toBeCloseTo(1.25, 2);
      expect(result!.changePercent).toBeCloseTo(0.8389, 2);
    });

    it("should send correct auth headers", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(snapshotResponse),
      });

      const provider = new AlpacaProvider(validCredentials);
      await provider.fetchQuote("AAPL");

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/v2/stocks/AAPL/snapshot"),
        expect.objectContaining({
          headers: expect.objectContaining({
            "APCA-API-KEY-ID": "test-key-id",
            "APCA-API-SECRET-KEY": "test-secret-key",
          }),
        }),
      );
    });

    it("should return null on 403 response", async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 403 });

      const provider = new AlpacaProvider(validCredentials);
      const result = await provider.fetchQuote("AAPL");

      expect(result).toBeNull();
    });

    it("should throw on 401 (invalid credentials)", async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 401 });

      const provider = new AlpacaProvider(validCredentials);

      await expect(provider.fetchQuote("AAPL")).rejects.toThrow(
        "Alpaca authentication failed",
      );
    });

    it("should throw on 429 (rate limit)", async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 429 });

      const provider = new AlpacaProvider(validCredentials);

      await expect(provider.fetchQuote("AAPL")).rejects.toThrow(
        "Alpaca rate limit exceeded",
      );
    });

    it("should throw SYMBOL_NOT_FOUND on 422", async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 422 });

      const provider = new AlpacaProvider(validCredentials);

      await expect(provider.fetchQuote("INVALID")).rejects.toThrow(
        "not found on Alpaca",
      );
    });

    it("should return null when snapshot has no latestTrade", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          latestTrade: null,
          dailyBar: { o: 148.0, h: 151.5, l: 147.5, c: 150.0, v: 50000000 },
          prevDailyBar: { c: 149.0 },
        }),
      });

      const provider = new AlpacaProvider(validCredentials);
      const result = await provider.fetchQuote("AAPL");

      expect(result).toBeNull();
    });
  });

});
