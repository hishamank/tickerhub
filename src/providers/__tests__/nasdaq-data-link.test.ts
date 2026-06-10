import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { NasdaqDataLinkProvider } from "../nasdaq-data-link.js";

describe("NasdaqDataLinkProvider", () => {
  let provider: NasdaqDataLinkProvider;
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
        json: () => Promise.resolve({ dataset: { data: [] } }),
      } as Response),
    );
    globalThis.fetch = fetchMock;
    provider = new NasdaqDataLinkProvider({ api_key: "test-api-key" });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalFetch !== undefined) {
      globalThis.fetch = originalFetch;
    }
  });

  describe("constructor", () => {
    it("should throw ConfigurationError when no API key provided", () => {
      expect(() => new NasdaqDataLinkProvider(null)).toThrow(
        "Nasdaq Data Link API key is required",
      );
    });

    it("should throw ConfigurationError when credentials have no api_key", () => {
      expect(() => new NasdaqDataLinkProvider({})).toThrow(
        "Nasdaq Data Link API key is required",
      );
    });

    it("should create successfully with valid credentials", () => {
      const p = new NasdaqDataLinkProvider({ api_key: "valid-key" });
      expect(p.name).toBe("nasdaq-data-link");
    });
  });

  describe("metadata", () => {
    it("should have name 'nasdaq-data-link'", () => {
      expect(provider.name).toBe("nasdaq-data-link");
    });

    it("should only support macro data type", () => {
      expect(provider.supportedDataTypes).toEqual(["macro"]);
    });

    it("should have correct rate limits", () => {
      expect(provider.rateLimit).toEqual({
        requestsPerMinute: 10,
        requestsPerDay: 50,
        burstLimit: 3,
      });
    });
  });

  describe("fetchQuote", () => {
    it("should return null (not a stock quote provider)", async () => {
      const result = await provider.fetchQuote("AAPL");
      expect(result).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("fetchMacroIndicator", () => {
    const validGdpResponse = {
      dataset: {
        name: "Gross Domestic Product",
        frequency: "quarterly",
        column_names: ["Date", "Value"],
        data: [
          ["2026-01-01", 28500.5],
          ["2025-10-01", 28100.2],
        ],
        newest_available_date: "2026-01-01",
      },
    };

    it("should return parsed MacroIndicatorData for valid GDP response", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(validGdpResponse),
      });

      const result = await provider.fetchMacroIndicator("GDP");

      expect(result).not.toBeNull();
      expect(result!.indicator).toBe("GDP");
      expect(result!.name).toBe("Gross Domestic Product");
      expect(result!.value).toBe(28500.5);
      expect(result!.unit).toBe("Billions of Dollars");
      expect(result!.frequency).toBe("quarterly");
      expect(result!.source).toBe("nasdaq-data-link");
      expect(result!.seasonallyAdjusted).toBe(true);
      expect(result!.period).toBe("2026-01-01");
    });

    it("should calculate previousValue and changePercent", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(validGdpResponse),
      });

      const result = await provider.fetchMacroIndicator("GDP");

      expect(result!.previousValue).toBe(28100.2);
      expect(result!.changePercent).toBeCloseTo(1.424, 2);
    });

    it("should normalize indicator to uppercase", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(validGdpResponse),
      });

      await provider.fetchMacroIndicator("gdp");

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/FRED/GDP.json"),
      );
    });

    it("should return null for 404 (unknown series)", async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 404,
      });

      const result = await provider.fetchMacroIndicator("UNKNOWN_SERIES");
      expect(result).toBeNull();
    });

    it("should return null for empty dataset", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          dataset: { data: [] },
        }),
      });

      const result = await provider.fetchMacroIndicator("GDP");
      expect(result).toBeNull();
    });

    it("should return null for missing dataset", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({}),
      });

      const result = await provider.fetchMacroIndicator("GDP");
      expect(result).toBeNull();
    });

    it("should throw on 400 (bad request / invalid API key)", async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 400,
      });

      await expect(provider.fetchMacroIndicator("GDP")).rejects.toThrow(
        "Nasdaq Data Link API key is invalid or expired",
      );
    });

    it("should throw on 401 (invalid API key)", async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 401,
      });

      await expect(provider.fetchMacroIndicator("GDP")).rejects.toThrow(
        "Nasdaq Data Link API key is invalid or expired",
      );
    });

    it("should throw on 403 (forbidden)", async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 403,
      });

      await expect(provider.fetchMacroIndicator("GDP")).rejects.toThrow(
        "Nasdaq Data Link API key is invalid or expired",
      );
    });

    it("should throw on 429 (rate limit)", async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 429,
      });

      await expect(provider.fetchMacroIndicator("GDP")).rejects.toThrow(
        "Nasdaq Data Link rate limit exceeded",
      );
    });

    it("should use known metadata for FEDFUNDS", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          dataset: {
            name: "Federal Funds Effective Rate",
            frequency: "monthly",
            data: [["2026-02-01", 5.33]],
            newest_available_date: "2026-02-01",
          },
        }),
      });

      const result = await provider.fetchMacroIndicator("FEDFUNDS");

      expect(result!.indicator).toBe("FEDFUNDS");
      expect(result!.unit).toBe("Percent");
      expect(result!.frequency).toBe("monthly");
      expect(result!.seasonallyAdjusted).toBe(false);
    });

    it("should handle unknown series with fallback metadata", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          dataset: {
            name: "Some Custom Series",
            frequency: "weekly",
            data: [["2026-03-01", 42.5]],
            newest_available_date: "2026-03-01",
          },
        }),
      });

      const result = await provider.fetchMacroIndicator("CUSTOM");

      expect(result!.indicator).toBe("CUSTOM");
      expect(result!.name).toBe("Some Custom Series");
      expect(result!.unit).toBe("Units");
      expect(result!.frequency).toBe("weekly");
      expect(result!.seasonallyAdjusted).toBe(false);
    });
  });

  describe("fetchMultipleIndicators", () => {
    it("should fetch multiple series and return successful results", async () => {
      let callCount = 0;
      fetchMock.mockImplementation(() => {
        callCount++;
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              dataset: {
                name: `Series ${callCount}`,
                data: [["2026-01-01", callCount * 100]],
                newest_available_date: "2026-01-01",
              },
            }),
        });
      });

      const results = await provider.fetchMultipleIndicators([
        "GDP",
        "UNRATE",
      ]);

      expect(results).toHaveLength(2);
      expect(results[0]!.indicator).toBe("GDP");
      expect(results[1]!.indicator).toBe("UNRATE");
    });

    it("should skip failed series and return successful ones", async () => {
      let callCount = 0;
      fetchMock.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({ ok: false, status: 404 });
        }
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              dataset: {
                name: "Unemployment Rate",
                data: [["2026-01-01", 3.7]],
                newest_available_date: "2026-01-01",
              },
            }),
        });
      });

      const results = await provider.fetchMultipleIndicators([
        "UNKNOWN",
        "UNRATE",
      ]);

      expect(results).toHaveLength(1);
      expect(results[0]!.indicator).toBe("UNRATE");
    });

    it("should return empty array when all fail", async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 404 });

      const results = await provider.fetchMultipleIndicators([
        "X1",
        "X2",
      ]);

      expect(results).toEqual([]);
    });
  });

  describe("healthCheck", () => {
    it("should return true when API is accessible", async () => {
      fetchMock.mockResolvedValue({ ok: true, status: 200 });

      const result = await provider.healthCheck();
      expect(result).toBe(true);
    });

    it("should return false on error", async () => {
      fetchMock.mockRejectedValue(new Error("Network error"));

      const result = await provider.healthCheck();
      expect(result).toBe(false);
    });

    it("should return false on non-OK response", async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 500 });

      const result = await provider.healthCheck();
      expect(result).toBe(false);
    });
  });
});
