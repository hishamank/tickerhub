/**
 * Tests for Twelve Data Provider — fetchQuote parsing and error handling.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TwelveDataProvider } from "../twelve-data.js";
import { ProviderError, ProviderErrorCode } from "../../types/provider.js";
import {
  VALID_CREDENTIALS,
  mockResponse,
  stockQuoteResponse,
} from "./twelve-data-helpers.js";

describe("TwelveDataProvider — fetchQuote", () => {
  let provider: TwelveDataProvider;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    provider = new TwelveDataProvider(VALID_CREDENTIALS);
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should parse a valid stock quote response", async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(stockQuoteResponse));

    const result = await provider.fetchQuote("AAPL");

    expect(result).not.toBeNull();
    expect(result!.symbol).toBe("AAPL");
    expect(result!.price).toBe(179.9);
    expect(result!.open).toBe(178.5);
    expect(result!.high).toBe(180.25);
    expect(result!.low).toBe(177.8);
    expect(result!.close).toBe(179.9);
    expect(result!.previousClose).toBe(178.1);
    expect(result!.change).toBe(1.8);
    expect(result!.changePercent).toBe(1.01);
    expect(result!.volume).toBe(52341000);
    expect(result!.currency).toBe("USD");
    expect(result!.timestamp).toEqual(new Date(1700000000 * 1000));
  });

  it("should parse a valid forex quote response", async () => {
    const forexResponse = {
      symbol: "EUR/USD",
      name: "Euro / US Dollar",
      exchange: "Forex",
      currency: "USD",
      open: "1.0850",
      high: "1.0870",
      low: "1.0830",
      close: "1.0860",
      volume: "0",
      previous_close: "1.0840",
      change: "0.0020",
      percent_change: "0.18",
      timestamp: 1700000000,
    };

    fetchSpy.mockResolvedValueOnce(mockResponse(forexResponse));

    const result = await provider.fetchQuote("EUR/USD");

    expect(result).not.toBeNull();
    expect(result!.symbol).toBe("EUR/USD");
    expect(result!.price).toBe(1.086);
    expect(result!.currency).toBe("USD");
    // Volume 0 for forex → undefined
    expect(result!.volume).toBeUndefined();
  });

  it("should parse a valid crypto quote response", async () => {
    const cryptoResponse = {
      symbol: "BTC/USD",
      name: "Bitcoin / US Dollar",
      exchange: "Binance",
      currency: "USD",
      open: "42000.50",
      high: "42500.00",
      low: "41800.00",
      close: "42350.75",
      volume: "15000",
      previous_close: "41900.00",
      change: "450.75",
      percent_change: "1.08",
      timestamp: 1700000000,
    };

    fetchSpy.mockResolvedValueOnce(mockResponse(cryptoResponse));

    const result = await provider.fetchQuote("BTC/USD");

    expect(result).not.toBeNull();
    expect(result!.symbol).toBe("BTC/USD");
    expect(result!.price).toBe(42350.75);
    expect(result!.volume).toBe(15000);
  });

  it("should parse quote with datetime string instead of timestamp", async () => {
    const datetimeResponse = {
      symbol: "AAPL",
      name: "Apple Inc",
      exchange: "NASDAQ",
      currency: "USD",
      open: "178.50",
      high: "180.25",
      low: "177.80",
      close: "179.90",
      volume: "52341000",
      previous_close: "178.10",
      change: "1.80",
      percent_change: "1.01",
      datetime: "2024-11-14",
    };

    fetchSpy.mockResolvedValueOnce(mockResponse(datetimeResponse));

    const result = await provider.fetchQuote("AAPL");

    expect(result).not.toBeNull();
    expect(result!.timestamp).toEqual(new Date("2024-11-14"));
  });

  it("should throw RATE_LIMIT_EXCEEDED on HTTP 429", async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(null, 429));

    const promise = provider.fetchQuote("AAPL");
    await expect(promise).rejects.toThrow(ProviderError);

    fetchSpy.mockResolvedValueOnce(mockResponse(null, 429));
    await expect(provider.fetchQuote("AAPL")).rejects.toMatchObject({
      code: ProviderErrorCode.RATE_LIMIT_EXCEEDED,
      retryable: true,
    });
  });

  it("should throw AUTHENTICATION_FAILED on HTTP 401", async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(null, 401));

    const promise = provider.fetchQuote("AAPL");
    await expect(promise).rejects.toThrow(ProviderError);

    fetchSpy.mockResolvedValueOnce(mockResponse(null, 401));
    await expect(provider.fetchQuote("AAPL")).rejects.toMatchObject({
      code: ProviderErrorCode.AUTHENTICATION_FAILED,
      retryable: false,
    });
  });

  it("should throw AUTHENTICATION_FAILED on HTTP 403", async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(null, 403));

    await expect(provider.fetchQuote("AAPL")).rejects.toMatchObject({
      code: ProviderErrorCode.AUTHENTICATION_FAILED,
      retryable: false,
    });
  });

  it("should throw SYMBOL_NOT_FOUND on HTTP 404", async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(null, 404));

    const promise = provider.fetchQuote("INVALID");
    await expect(promise).rejects.toThrow(ProviderError);

    fetchSpy.mockResolvedValueOnce(mockResponse(null, 404));
    await expect(provider.fetchQuote("INVALID")).rejects.toMatchObject({
      code: ProviderErrorCode.SYMBOL_NOT_FOUND,
    });
  });

  it("should handle API error response with HTTP 200", async () => {
    const errorBody = {
      code: 400,
      message: "**symbol** not found: XXXYYY. Please specify it correctly.",
      status: "error",
    };

    fetchSpy.mockResolvedValueOnce(mockResponse(errorBody, 200));

    const promise = provider.fetchQuote("XXXYYY");
    await expect(promise).rejects.toThrow(ProviderError);

    fetchSpy.mockResolvedValueOnce(mockResponse(errorBody, 200));
    await expect(provider.fetchQuote("XXXYYY")).rejects.toMatchObject({
      code: ProviderErrorCode.SYMBOL_NOT_FOUND,
    });
  });

  it("should handle API rate limit error with HTTP 200", async () => {
    const errorBody = {
      code: 429,
      message: "You have exceeded the rate limit.",
      status: "error",
    };

    fetchSpy.mockResolvedValueOnce(mockResponse(errorBody, 200));

    const promise = provider.fetchQuote("AAPL");
    await expect(promise).rejects.toThrow(ProviderError);

    fetchSpy.mockResolvedValueOnce(mockResponse(errorBody, 200));
    await expect(provider.fetchQuote("AAPL")).rejects.toMatchObject({
      code: ProviderErrorCode.RATE_LIMIT_EXCEEDED,
      retryable: true,
    });
  });

  it("should reject empty symbol", async () => {
    const promise = provider.fetchQuote("");
    await expect(promise).rejects.toThrow(ProviderError);

    await expect(provider.fetchQuote("")).rejects.toMatchObject({
      code: ProviderErrorCode.INVALID_REQUEST,
    });
  });

  it("should URL-encode symbols with slashes", async () => {
    fetchSpy.mockResolvedValueOnce(
      mockResponse({
        symbol: "EUR/USD",
        name: "Euro / US Dollar",
        exchange: "Forex",
        currency: "USD",
        open: "1.0850",
        high: "1.0870",
        low: "1.0830",
        close: "1.0860",
        volume: "0",
        previous_close: "1.0840",
        change: "0.0020",
        percent_change: "0.18",
        timestamp: 1700000000,
      }),
    );

    await provider.fetchQuote("EUR/USD");

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("symbol=EUR%2FUSD"),
    );
  });
});
