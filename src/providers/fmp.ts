import { getLogger } from "../logging/index.js";
import { ConfigurationError } from "../errors/index.js";
/**
 * Financial Modeling Prep (FMP) Provider
 *
 * Implements the MarketDataProvider interface for FMP API.
 * Requires API key. Free tier: 250 calls/day.
 *
 * NOTE: Some endpoints (e.g., ratings) require a paid subscription on the free plan.
 * 403 responses are handled gracefully by returning empty results instead of throwing
 * to prevent worker cycle crashes and allow fallback to other providers.
 */

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

const logger = getLogger(
  "fmp",
  "packages/provider-aggregator/src/providers/fmp.ts",
);

interface FMPDividend {
  date: string;
  dividend: number;
  paymentDate?: string;
  recordDate?: string;
}

interface FMPDividendHistory {
  historical?: FMPDividend[];
}

interface FMPEarningsItem {
  date: string;
  quarter: number;
  fiscalYear?: number;
  epsEstimate?: number;
  epsActual?: number;
  revenueEstimated?: number;
  revenue?: number;
}

interface FMPRating {
  rating: string;
  ratingTargetPrice?: number;
}

interface FMPHistoricalItem {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface FMPHistoricalResponse {
  historical?: FMPHistoricalItem[];
}

interface FMPQuoteResponse {
  symbol: string;
  name: string;
  price: number;
  changesPercentage: number;
  change: number;
  dayLow: number;
  dayHigh: number;
  open: number;
  previousClose: number;
  volume: number;
  timestamp: number;
}

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

  /**
   * Fetch current stock quote
   */
  async fetchQuote(symbol: string): Promise<QuoteData | null> {
    this.validateSymbol(symbol);

    try {
      const normalizedSymbol = symbol.toUpperCase();
      const url = `${this.baseUrl}/quote/${normalizedSymbol}?apikey=${this.apiKey}`;

      const response = await fetch(url);

      if (!response.ok) {
        if (response.status === 429) {
          throw new ProviderError(
            ProviderErrorCode.RATE_LIMIT_EXCEEDED,
            "FMP rate limit exceeded",
            true,
            3600, // Retry after 1 hour for daily limit
          );
        }

        if (response.status === 401) {
          throw new ProviderError(
            ProviderErrorCode.AUTHENTICATION_FAILED,
            "FMP authentication failed - check API key",
            false,
          );
        }

        if (response.status === 403) {
          logger.warn(
            `[fmp] 403 Forbidden for quote - endpoint may require paid subscription or API key invalid for ${symbol}`,
          );
          return null;
        }

        throw new ProviderError(
          ProviderErrorCode.NETWORK_ERROR,
          `FMP API returned ${response.status}`,
          true,
        );
      }

      const data = (await response.json()) as
        | FMPQuoteResponse[]
        | { "Error Message"?: string };

      // Check for error message
      if (!Array.isArray(data)) {
        if ("Error Message" in data && data["Error Message"]) {
          throw new ProviderError(
            ProviderErrorCode.SYMBOL_NOT_FOUND,
            `Symbol ${normalizedSymbol} not found`,
            false,
          );
        }
        throw new ProviderError(
          ProviderErrorCode.PROVIDER_ERROR,
          "Invalid response from FMP API",
          true,
        );
      }

      if (data.length === 0 || !data[0]) {
        throw new ProviderError(
          ProviderErrorCode.SYMBOL_NOT_FOUND,
          `Symbol ${normalizedSymbol} not found`,
          false,
        );
      }

      const quote = data[0]!;

      const quoteData: QuoteData = {
        symbol: normalizedSymbol,
        price: quote.price,
        open: quote.open,
        high: quote.dayHigh,
        low: quote.dayLow,
        previousClose: quote.previousClose,
        change: quote.change,
        changePercent: quote.changesPercentage,
        volume: quote.volume,
        timestamp: new Date(quote.timestamp * 1000), // Convert Unix seconds to Date
        currency: "USD",
      };

      // Validate the response
      return validateData(
        QuoteDataSchema,
        quoteData,
        `FMP quote for ${symbol}`,
      );
    } catch (error) {
      if (error instanceof ProviderError) {
        throw error;
      }
      return this.handleHttpError(error, `fetchQuote(${symbol})`);
    }
  }

  /**
   * Fetch dividend history
   */
  async fetchDividends(
    symbol: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<DividendData[]> {
    this.validateSymbol(symbol);

    try {
      const normalizedSymbol = symbol.toUpperCase();
      const url = `${this.baseUrl}/historical-price-full/stock_dividend/${normalizedSymbol}?apikey=${this.apiKey}`;

      const response = await fetch(url);

      if (!response.ok) {
        if (response.status === 429) {
          throw new ProviderError(
            ProviderErrorCode.RATE_LIMIT_EXCEEDED,
            "FMP rate limit exceeded",
            true,
            3600,
          );
        }

        if (response.status === 403) {
          logger.warn(
            `[fmp] 403 Forbidden for dividends - endpoint may require paid subscription for ${symbol}`,
          );
          return [];
        }

        throw new ProviderError(
          ProviderErrorCode.NETWORK_ERROR,
          `FMP API returned ${response.status}`,
          true,
        );
      }

      const data = (await response.json()) as FMPDividendHistory;

      if (!data.historical || !Array.isArray(data.historical)) {
        return [];
      }

      // Filter by date range if provided
      let dividends = data.historical;
      if (startDate || endDate) {
        dividends = dividends.filter((div: FMPDividend) => {
          const divDate = new Date(div.date);
          if (startDate && divDate < startDate) return false;
          if (endDate && divDate > endDate) return false;
          return true;
        });
      }

      // Transform FMP response to DividendData
      const result: DividendData[] = dividends.map((div: FMPDividend) => ({
        exDate: new Date(div.date),
        amount: div.dividend,
        currency: "USD",
        paymentDate: div.paymentDate ? new Date(div.paymentDate) : undefined,
        recordDate: div.recordDate ? new Date(div.recordDate) : undefined,
      }));

      // Validate each dividend
      return result.map((div) =>
        validateData(DividendDataSchema, div, `FMP dividend for ${symbol}`),
      );
    } catch (error) {
      if (error instanceof ProviderError) {
        throw error;
      }
      return this.handleHttpError(error, `fetchDividends(${symbol})`);
    }
  }

  /**
   * Fetch earnings data
   */
  async fetchEarnings(symbol: string): Promise<EarningsData[]> {
    this.validateSymbol(symbol);

    try {
      const normalizedSymbol = symbol.toUpperCase();
      const url = `${this.baseUrl}/earnings-calendar/${normalizedSymbol}?apikey=${this.apiKey}`;

      const response = await fetch(url);

      if (!response.ok) {
        if (response.status === 403) {
          logger.warn(
            `[fmp] 403 Forbidden for earnings - endpoint may require paid subscription for ${symbol}`,
          );
          return [];
        }

        throw new ProviderError(
          ProviderErrorCode.NETWORK_ERROR,
          `FMP API returned ${response.status}`,
          true,
        );
      }

      const data = (await response.json()) as FMPEarningsItem[];

      if (!Array.isArray(data) || data.length === 0) {
        return [];
      }

      const result: EarningsData[] = data.map((item: FMPEarningsItem) => ({
        date: new Date(item.date),
        fiscalQuarter: `Q${item.quarter}`,
        fiscalYear: item.fiscalYear || new Date(item.date).getFullYear(),
        estimate: item.epsEstimate ?? undefined,
        actual: item.epsActual ?? undefined,
        revenueEstimate: item.revenueEstimated ?? undefined,
        revenueActual: item.revenue ?? undefined,
      }));

      return result.map((earning) =>
        validateData(EarningsDataSchema, earning, `FMP earnings for ${symbol}`),
      );
    } catch (error) {
      if (error instanceof ProviderError) {
        throw error;
      }
      return this.handleHttpError(error, `fetchEarnings(${symbol})`);
    }
  }

  /**
   * Fetch analyst ratings
   */
  async fetchRatings(symbol: string): Promise<RatingData | null> {
    this.validateSymbol(symbol);

    try {
      const normalizedSymbol = symbol.toUpperCase();
      const url = `${this.baseUrl}/rating/${normalizedSymbol}?apikey=${this.apiKey}`;

      const response = await fetch(url);

      if (!response.ok) {
        if (response.status === 403) {
          logger.warn(
            `[fmp] 403 Forbidden for ratings - endpoint requires paid subscription for ${symbol}`,
          );
          return null;
        }

        throw new ProviderError(
          ProviderErrorCode.NETWORK_ERROR,
          `FMP API returned ${response.status}`,
          true,
        );
      }

      const data = (await response.json()) as FMPRating[];

      if (!Array.isArray(data) || data.length === 0) {
        return null;
      }

      const latest = data[0];
      if (!latest) {
        return null;
      }

      const result: RatingData = {
        consensus: this.mapRatingToConsensus(latest.rating),
        targetPrice: latest.ratingTargetPrice ?? undefined,
        numberOfAnalysts: 1, // FMP doesn't provide count
      };

      return validateData(
        RatingDataSchema,
        result,
        `FMP ratings for ${symbol}`,
      );
    } catch (error) {
      if (error instanceof ProviderError) {
        throw error;
      }
      return this.handleHttpError(error, `fetchRatings(${symbol})`);
    }
  }

  /**
   * Fetch historical prices
   */
  async fetchHistoricalPrices(
    symbol: string,
    startDate: Date,
    endDate: Date,
  ): Promise<HistoricalPrice[]> {
    this.validateSymbol(symbol);

    try {
      const normalizedSymbol = symbol.toUpperCase();

      // Format dates as YYYY-MM-DD
      const from = startDate.toISOString().split("T")[0];
      const to = endDate.toISOString().split("T")[0];

      const url = `${this.baseUrl}/historical-price-full/${normalizedSymbol}?from=${from}&to=${to}&apikey=${this.apiKey}`;

      const response = await fetch(url);

      if (!response.ok) {
        if (response.status === 429) {
          throw new ProviderError(
            ProviderErrorCode.RATE_LIMIT_EXCEEDED,
            "FMP rate limit exceeded",
            true,
            3600,
          );
        }

        if (response.status === 403) {
          logger.warn(
            `[fmp] 403 Forbidden for historical prices - endpoint may require paid subscription for ${symbol}`,
          );
          return [];
        }

        throw new ProviderError(
          ProviderErrorCode.NETWORK_ERROR,
          `FMP API returned ${response.status}`,
          true,
        );
      }

      const data = (await response.json()) as FMPHistoricalResponse;

      if (!data.historical || !Array.isArray(data.historical)) {
        return [];
      }

      // Transform FMP response to HistoricalPrice format
      const prices: HistoricalPrice[] = data.historical.map(
        (item: FMPHistoricalItem) => ({
        date: item.date,
        open: item.open,
        high: item.high,
        low: item.low,
        close: item.close,
        volume: item.volume,
      }));

      return prices;
    } catch (error) {
      if (error instanceof ProviderError) {
        throw error;
      }
      return this.handleHttpError(error, `fetchHistoricalPrices(${symbol})`);
    }
  }

  /**
   * Health check - verify FMP API is accessible
   */
  override async healthCheck(): Promise<boolean> {
    try {
      const url = `${this.baseUrl}/quote/AAPL?apikey=${this.apiKey}`;
      const response = await fetch(url);

      if (response.status === 403) {
        logger.warn(
          "[fmp] Health check returned 403 - API key may be invalid or endpoint requires paid subscription",
        );
        return false;
      }

      return response.ok;
    } catch (error) {
      logger.error("[fmp] Health check failed:", error);
      return false;
    }
  }

  private mapRatingToConsensus(rating: string): RatingData["consensus"] {
    const normalized = rating.toLowerCase();
    if (normalized.includes("strong buy")) return "strong_buy";
    if (normalized.includes("buy")) return "buy";
    if (normalized.includes("sell")) return "sell";
    return "hold";
  }
}
