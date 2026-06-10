/**
 * Tests for Twelve Data Provider — constructor, healthCheck, and metadata.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TwelveDataProvider } from "../twelve-data.js";
import {
  VALID_CREDENTIALS,
  mockResponse,
  stockQuoteResponse,
} from "./twelve-data-helpers.js";

describe("TwelveDataProvider", () => {
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

  // ── Constructor ──────────────────────────────────────────────

  describe("constructor", () => {
    it("should create instance with valid credentials", () => {
      const p = new TwelveDataProvider({ api_key: "abc" });
      expect(p.name).toBe("twelve-data");
      expect(p.supportedDataTypes).toEqual(["prices"]);
    });

    it("should throw ConfigurationError when credentials are null", () => {
      expect(() => new TwelveDataProvider(null)).toThrow(
        "Twelve Data API key is required",
      );
    });

    it("should throw ConfigurationError when api_key is missing", () => {
      expect(() => new TwelveDataProvider({ other: "value" })).toThrow(
        "Twelve Data API key is required",
      );
    });
  });

  // ── healthCheck ──────────────────────────────────────────────

  describe("healthCheck", () => {
    it("should return true when API responds successfully", async () => {
      fetchSpy.mockResolvedValueOnce(mockResponse(stockQuoteResponse));

      const result = await provider.healthCheck();
      expect(result).toBe(true);
    });

    it("should return false on API error response", async () => {
      fetchSpy.mockResolvedValueOnce(
        mockResponse({
          code: 401,
          message: "Invalid API key",
          status: "error",
        }),
      );

      const result = await provider.healthCheck();
      expect(result).toBe(false);
    });

    it("should return false on HTTP error", async () => {
      fetchSpy.mockResolvedValueOnce(mockResponse(null, 500));

      const result = await provider.healthCheck();
      expect(result).toBe(false);
    });

    it("should return false on network failure", async () => {
      fetchSpy.mockRejectedValueOnce(new Error("ECONNREFUSED"));

      const result = await provider.healthCheck();
      expect(result).toBe(false);
    });
  });

  // ── Provider metadata ────────────────────────────────────────

  describe("provider metadata", () => {
    it("should have correct rate limit config", () => {
      expect(provider.rateLimit).toEqual({
        requestsPerMinute: 8,
        requestsPerDay: 800,
        burstLimit: 4,
      });
    });

    it("should support only prices data type", () => {
      expect(provider.supportsDataType("prices")).toBe(true);
      expect(provider.supportsDataType("dividends")).toBe(false);
      expect(provider.supportsDataType("earnings")).toBe(false);
      expect(provider.supportsDataType("events")).toBe(false);
      expect(provider.supportsDataType("ratings")).toBe(false);
    });
  });
});
