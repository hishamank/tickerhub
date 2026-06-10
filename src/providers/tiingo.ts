import { getLogger } from "../logging/index.js";
import { ConfigurationError } from "../errors/index.js";
/**
 * Tiingo Provider
 *
 * Implements the MarketDataProvider interface for Tiingo API.
 * Requires API key. Free tier: 500 calls/hour.
 *
 * Supports prices, dividends, and historical data.
 */

import { BaseProvider } from "./base-provider.js";
import type {
  QuoteData,
  DividendData,
  HistoricalPrice,
  DataType,
  RateLimitConfig,
} from "../types/index.js";
import { ProviderError, ProviderErrorCode } from "../types/provider.js";
import {
  QuoteDataSchema,
  DividendDataSchema,
  validateData,
} from "../types/validation.js";

const logger = getLogger(
  "tiingo",
  "packages/provider-aggregator/src/providers/tiingo.ts",
);

interface TiingoPrice {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  adjClose: number;
  volume: number;
  divCash?: number;
}

export class TiingoProvider extends BaseProvider {
  readonly name = "tiingo";
  readonly supportedDataTypes: DataType[] = ["prices", "dividends"];
  readonly rateLimit: RateLimitConfig = {
    requestsPerHour: 500, // Free tier limit
  };

  private apiKey: string;
  private baseUrl = "https://api.tiingo.com/tiingo/daily";

  constructor(credentials: Record<string, string> | null) {
    super();

    const apiKey = credentials?.api_key;
    if (!apiKey) {
      throw new ConfigurationError("Tiingo API key is required");
    }

    this.apiKey = apiKey;
  }

  /**
   * Fetch current stock quote
   */
  async fetchQuote(symbol: string): Promise<QuoteData> {
    this.validateSymbol(symbol);

    try {
      const normalizedSymbol = symbol.toUpperCase();
      const url = `${this.baseUrl}/${normalizedSymbol}/prices?token=${this.apiKey}`;

      const response = await fetch(url);

      if (!response.ok) {
        if (response.status === 429) {
          throw new ProviderError(
            ProviderErrorCode.RATE_LIMIT_EXCEEDED,
            "Tiingo rate limit exceeded",
            true,
            3600,
          );
        }

        if (response.status === 401 || response.status === 403) {
          throw new ProviderError(
            ProviderErrorCode.AUTHENTICATION_FAILED,
            "Tiingo authentication failed - check API key",
            false,
          );
        }

        if (response.status === 404) {
          throw new ProviderError(
            ProviderErrorCode.SYMBOL_NOT_FOUND,
            `Symbol ${normalizedSymbol} not found`,
            false,
          );
        }

        throw new ProviderError(
          ProviderErrorCode.NETWORK_ERROR,
          `Tiingo API returned ${response.status}`,
          true,
        );
      }

      const data = (await response.json()) as TiingoPrice[];

      if (!Array.isArray(data) || data.length === 0) {
        throw new ProviderError(
          ProviderErrorCode.SYMBOL_NOT_FOUND,
          `Symbol ${normalizedSymbol} not found`,
          false,
        );
      }

      const latest = data[0]!;

      const quoteData: QuoteData = {
        symbol: normalizedSymbol,
        price: latest.close,
        open: latest.open,
        high: latest.high,
        low: latest.low,
        close: latest.close,
        previousClose: latest.adjClose,
        volume: latest.volume,
        timestamp: new Date(latest.date),
        currency: "USD",
      };

      // Validate the response
      return validateData(
        QuoteDataSchema,
        quoteData,
        `Tiingo quote for ${symbol}`,
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

      // Format dates as YYYY-MM-DD
      const start =
        startDate || new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
      const end = endDate || new Date();
      const startStr = start.toISOString().split("T")[0];
      const endStr = end.toISOString().split("T")[0];

      const url = `${this.baseUrl}/${normalizedSymbol}/prices?token=${this.apiKey}&startDate=${startStr}&endDate=${endStr}&format=json&resampleFreq=daily`;

      const response = await fetch(url);

      if (!response.ok) {
        if (response.status === 429) {
          throw new ProviderError(
            ProviderErrorCode.RATE_LIMIT_EXCEEDED,
            "Tiingo rate limit exceeded",
            true,
            3600,
          );
        }
        if (response.status === 404) {
          return []; // Symbol not found, return empty
        }
        throw new ProviderError(
          ProviderErrorCode.NETWORK_ERROR,
          `Tiingo API returned ${response.status}`,
          true,
        );
      }

      const data = (await response.json()) as TiingoPrice[];

      if (!Array.isArray(data)) {
        return [];
      }

      // Tiingo includes dividend info in the divCash field
      const dividends: DividendData[] = data
        .filter((item: TiingoPrice) => item.divCash && item.divCash > 0)
        .map((item: TiingoPrice) => ({
          exDate: new Date(item.date),
          amount: item.divCash!, // guaranteed by the preceding filter
          currency: "USD",
        }));

      // Validate each dividend
      return dividends.map((div) =>
        validateData(DividendDataSchema, div, `Tiingo dividend for ${symbol}`),
      );
    } catch (error) {
      if (error instanceof ProviderError) {
        throw error;
      }
      return this.handleHttpError(error, `fetchDividends(${symbol})`);
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
      const startStr = startDate.toISOString().split("T")[0];
      const endStr = endDate.toISOString().split("T")[0];

      const url = `${this.baseUrl}/${normalizedSymbol}/prices?token=${this.apiKey}&startDate=${startStr}&endDate=${endStr}&format=json&resampleFreq=daily`;

      const response = await fetch(url);

      if (!response.ok) {
        if (response.status === 429) {
          throw new ProviderError(
            ProviderErrorCode.RATE_LIMIT_EXCEEDED,
            "Tiingo rate limit exceeded",
            true,
            3600,
          );
        }
        if (response.status === 404) {
          return []; // Symbol not found
        }
        throw new ProviderError(
          ProviderErrorCode.NETWORK_ERROR,
          `Tiingo API returned ${response.status}`,
          true,
        );
      }

      const data = (await response.json()) as TiingoPrice[];

      if (!Array.isArray(data) || data.length === 0) {
        return [];
      }

      // Transform Tiingo data to HistoricalPrice format
      const prices: HistoricalPrice[] = data.map((item: TiingoPrice) => ({
        date: item.date.split("T")[0]!, // Extract date part
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
   * Health check - verify Tiingo API is accessible
   */
  override async healthCheck(): Promise<boolean> {
    try {
      const url = `${this.baseUrl}/AAPL/prices?token=${this.apiKey}`;
      const response = await fetch(url);
      return response.ok;
    } catch (error) {
      logger.error("[tiingo] Health check failed:", error);
      return false;
    }
  }
}
