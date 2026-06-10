/**
 * Financial Modeling Prep (FMP) Provider
 *
 * Implements the MarketDataProvider interface for FMP API.
 * Requires API key. Free tier: 250 calls/day.
 *
 * Thin HTTP/orchestration layer: response shapes live in `fmp-types.ts` and
 * pure transforms + status handling in `fmp-mappers.ts`. 403 responses degrade
 * to empty results so the aggregator can fall back to other providers.
 */

import { getLogger } from "../logging/index.js";
import { ConfigurationError } from "../errors/index.js";
import { BaseProvider } from "./base-provider.js";
import type {
  QuoteData,
  DividendData,
  EarningsData,
  RatingData,
  HistoricalPrice,
  DataType,
  RateLimitConfig,
} from "../types/index.js";
import { ProviderError, ProviderErrorCode } from "../types/provider.js";
import {
  QuoteDataSchema,
  DividendDataSchema,
  EarningsDataSchema,
  RatingDataSchema,
  validateData,
} from "../types/validation.js";
import type {
  FMPQuoteResponse,
  FMPDividendHistory,
  FMPEarningsItem,
  FMPRating,
  FMPHistoricalResponse,
} from "./fmp-types.js";
import {
  fmpForbiddenOrThrow,
  mapQuote,
  mapDividends,
  mapEarnings,
  mapHistorical,
  mapRatingToConsensus,
} from "./fmp-mappers.js";

const logger = getLogger("fmp", "provider-aggregator/providers");

export class FMPProvider extends BaseProvider {
  readonly name = "fmp";
  readonly supportedDataTypes: DataType[] = [
    "prices",
    "dividends",
    "earnings",
    "events",
    "ratings",
  ];
  readonly rateLimit: RateLimitConfig = {
    requestsPerDay: 250, // Free tier limit
  };

  private apiKey: string;
  private baseUrl = "https://financialmodelingprep.com/api/v3";

  constructor(credentials: Record<string, string> | null) {
    super();
    const apiKey = credentials?.api_key;
    if (!apiKey) {
      throw new ConfigurationError("FMP API key is required");
    }
    this.apiKey = apiKey;
  }

  async fetchQuote(symbol: string): Promise<QuoteData | null> {
    this.validateSymbol(symbol);
    try {
      const normalizedSymbol = symbol.toUpperCase();
      const response = await fetch(
        `${this.baseUrl}/quote/${normalizedSymbol}?apikey=${this.apiKey}`,
      );
      if (fmpForbiddenOrThrow(response, "quote", symbol)) return null;

      const data = (await response.json()) as
        | FMPQuoteResponse[]
        | { "Error Message"?: string };

      if (!Array.isArray(data)) {
        const isErrorMessage = "Error Message" in data && !!data["Error Message"];
        throw new ProviderError(
          isErrorMessage
            ? ProviderErrorCode.SYMBOL_NOT_FOUND
            : ProviderErrorCode.PROVIDER_ERROR,
          isErrorMessage
            ? `Symbol ${normalizedSymbol} not found`
            : "Invalid response from FMP API",
          !isErrorMessage,
        );
      }

      const quote = data[0];
      if (!quote) {
        throw new ProviderError(
          ProviderErrorCode.SYMBOL_NOT_FOUND,
          `Symbol ${normalizedSymbol} not found`,
          false,
        );
      }
      return validateData(
        QuoteDataSchema,
        mapQuote(quote, normalizedSymbol),
        `FMP quote for ${symbol}`,
      );
    } catch (error) {
      return this.handleHttpError(error, `fetchQuote(${symbol})`);
    }
  }

  async fetchDividends(
    symbol: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<DividendData[]> {
    this.validateSymbol(symbol);
    try {
      const normalizedSymbol = symbol.toUpperCase();
      const response = await fetch(
        `${this.baseUrl}/historical-price-full/stock_dividend/${normalizedSymbol}?apikey=${this.apiKey}`,
      );
      if (fmpForbiddenOrThrow(response, "dividends", symbol)) return [];

      const data = (await response.json()) as FMPDividendHistory;
      if (!data.historical || !Array.isArray(data.historical)) return [];

      return mapDividends(data.historical, startDate, endDate).map((div) =>
        validateData(DividendDataSchema, div, `FMP dividend for ${symbol}`),
      );
    } catch (error) {
      return this.handleHttpError(error, `fetchDividends(${symbol})`);
    }
  }

  async fetchEarnings(symbol: string): Promise<EarningsData[]> {
    this.validateSymbol(symbol);
    try {
      const normalizedSymbol = symbol.toUpperCase();
      const response = await fetch(
        `${this.baseUrl}/earnings-calendar/${normalizedSymbol}?apikey=${this.apiKey}`,
      );
      if (fmpForbiddenOrThrow(response, "earnings", symbol)) return [];

      const data = (await response.json()) as FMPEarningsItem[];
      if (!Array.isArray(data) || data.length === 0) return [];

      return mapEarnings(data).map((earning) =>
        validateData(EarningsDataSchema, earning, `FMP earnings for ${symbol}`),
      );
    } catch (error) {
      return this.handleHttpError(error, `fetchEarnings(${symbol})`);
    }
  }

  async fetchRatings(symbol: string): Promise<RatingData | null> {
    this.validateSymbol(symbol);
    try {
      const normalizedSymbol = symbol.toUpperCase();
      const response = await fetch(
        `${this.baseUrl}/rating/${normalizedSymbol}?apikey=${this.apiKey}`,
      );
      if (fmpForbiddenOrThrow(response, "ratings", symbol)) return null;

      const data = (await response.json()) as FMPRating[];
      const latest = data?.[0];
      if (!Array.isArray(data) || !latest) return null;

      return validateData(
        RatingDataSchema,
        {
          consensus: mapRatingToConsensus(latest.rating),
          targetPrice: latest.ratingTargetPrice ?? undefined,
          numberOfAnalysts: 1, // FMP doesn't provide a count
        },
        `FMP ratings for ${symbol}`,
      );
    } catch (error) {
      return this.handleHttpError(error, `fetchRatings(${symbol})`);
    }
  }

  async fetchHistoricalPrices(
    symbol: string,
    startDate: Date,
    endDate: Date,
  ): Promise<HistoricalPrice[]> {
    this.validateSymbol(symbol);
    try {
      const normalizedSymbol = symbol.toUpperCase();
      const from = startDate.toISOString().split("T")[0];
      const to = endDate.toISOString().split("T")[0];
      const response = await fetch(
        `${this.baseUrl}/historical-price-full/${normalizedSymbol}?from=${from}&to=${to}&apikey=${this.apiKey}`,
      );
      if (fmpForbiddenOrThrow(response, "historical prices", symbol)) return [];

      const data = (await response.json()) as FMPHistoricalResponse;
      if (!data.historical || !Array.isArray(data.historical)) return [];
      return mapHistorical(data.historical);
    } catch (error) {
      return this.handleHttpError(error, `fetchHistoricalPrices(${symbol})`);
    }
  }

  override async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(
        `${this.baseUrl}/quote/AAPL?apikey=${this.apiKey}`,
      );
      if (response.status === 403) {
        logger.warn(
          "[fmp] Health check returned 403 - API key may be invalid or paid plan required",
        );
        return false;
      }
      return response.ok;
    } catch (error) {
      logger.error("[fmp] Health check failed:", error);
      return false;
    }
  }
}
