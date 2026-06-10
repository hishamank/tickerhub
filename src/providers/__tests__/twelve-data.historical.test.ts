/**
 * Tests for Twelve Data Provider — fetchHistoricalPrices.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TwelveDataProvider } from "../twelve-data.js";
import { ProviderErrorCode } from "../../types/provider.js";
import {
  VALID_CREDENTIALS,
  mockResponse,
  timeSeriesResponse,
} from "./twelve-data-helpers.js";

describe("TwelveDataProvider — fetchHistoricalPrices", () => {
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

  it("should parse a valid time_series response", async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(timeSeriesResponse));

    const from = new Date("2024-01-01");
    const to = new Date("2024-01-05");
    const result = await provider.fetchHistoricalPrices("AAPL", from, to);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      date: "2024-01-05",
      open: 180,
      high: 182,
      low: 179,
      close: 181.5,
      volume: 50000000,
    });
    expect(result[1]).toEqual({
      date: "2024-01-04",
      open: 178,
      high: 180.5,
      low: 177,
      close: 179.8,
      volume: 48000000,
    });
  });

  it("should return empty array when no values", async () => {
    fetchSpy.mockResolvedValueOnce(
      mockResponse({ meta: { symbol: "AAPL" }, values: [] }),
    );

    const result = await provider.fetchHistoricalPrices(
      "AAPL",
      new Date("2024-01-01"),
      new Date("2024-01-05"),
    );

    expect(result).toEqual([]);
  });

  it("should return empty array when values is missing", async () => {
    fetchSpy.mockResolvedValueOnce(
      mockResponse({ meta: { symbol: "AAPL" } }),
    );

    const result = await provider.fetchHistoricalPrices(
      "AAPL",
      new Date("2024-01-01"),
      new Date("2024-01-05"),
    );

    expect(result).toEqual([]);
  });

  it("should handle API error in time_series", async () => {
    fetchSpy.mockResolvedValueOnce(
      mockResponse({
        code: 401,
        message: "Invalid API key",
        status: "error",
      }),
    );

    await expect(
      provider.fetchHistoricalPrices(
        "AAPL",
        new Date("2024-01-01"),
        new Date("2024-01-05"),
      ),
    ).rejects.toMatchObject({
      code: ProviderErrorCode.AUTHENTICATION_FAILED,
    });
  });

  it("should pass correct date parameters in URL", async () => {
    fetchSpy.mockResolvedValueOnce(
      mockResponse({ meta: { symbol: "AAPL" }, values: [] }),
    );

    await provider.fetchHistoricalPrices(
      "AAPL",
      new Date("2024-03-01"),
      new Date("2024-03-15"),
    );

    const calledUrl = fetchSpy.mock.calls[0]?.[0] as string;
    expect(calledUrl).toContain("start_date=2024-03-01");
    expect(calledUrl).toContain("end_date=2024-03-15");
    expect(calledUrl).toContain("interval=1day");
  });
});
