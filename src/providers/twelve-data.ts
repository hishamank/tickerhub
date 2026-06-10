/**
 * Twelve Data Provider
 *
 * Implements the MarketDataProvider interface for the Twelve Data API.
 * Requires API key. Free tier: 8 calls/min, 800 calls/day.
 * Covers stocks, forex, and crypto.
 *
 * Twelve Data uses slash notation for forex (EUR/USD) and crypto (BTC/USD),
 * so symbol validation is relaxed compared to stock-only providers.
 */

import { getLogger } from "../logging/index.js";
import { ConfigurationError } from "../errors/index.js";
import { BaseProvider } from "./base-provider.js";
import type {
  QuoteData,
  HistoricalPrice,
  DataType,
  RateLimitConfig,
} from "../types/index.js";
import { ProviderError, ProviderErrorCode } from "../types/provider.js";
import { QuoteDataSchema, validateData } from "../types/validation.js";
import type {
  TwelveDataQuoteResponse,
  TwelveDataErrorResponse,
  TwelveDataTimeSeriesResponse,
} from "./twelve-data-types.js";
import { handleHttpStatus, handleApiError } from "./twelve-data-types.js";

const logger = getLogger(
  "twelve-data",
  "packages/provider-aggregator/src/providers/twelve-data.ts",
);

export class TwelveDataProvider extends BaseProvider {
  readonly name = "twelve-data";
  readonly supportedDataTypes: DataType[] = ["prices"];
  readonly rateLimit: RateLimitConfig = {
    requestsPerMinute: 8,
    requestsPerDay: 800,
    burstLimit: 4,
  };

  private apiKey: string;
  private baseUrl = "https://api.twelvedata.com";

  constructor(credentials: Record<string, string> | null) {
    super();

    const apiKey = credentials?.api_key;
    if (!apiKey) {
      throw new ConfigurationError("Twelve Data API key is required");
    }

    this.apiKey = apiKey;
  }

  protected override validateSymbol(symbol: string): void {
    if (!symbol || symbol.trim().length === 0) {
      throw new ProviderError(
        ProviderErrorCode.INVALID_REQUEST,
        "Symbol cannot be empty",
        false,
      );
    }

    if (symbol.length > 10) {
      throw new ProviderError(
        ProviderErrorCode.INVALID_REQUEST,
        "Symbol too long (max 10 characters)",
        false,
      );
    }

    if (!/^[A-Z0-9./-]+$/i.test(symbol)) {
      throw new ProviderError(
        ProviderErrorCode.INVALID_REQUEST,
        "Symbol contains invalid characters",
        false,
      );
    }
  }

  async fetchQuote(symbol: string): Promise<QuoteData | null> {
    this.validateSymbol(symbol);

    try {
      const url = `${this.baseUrl}/quote?symbol=${encodeURIComponent(symbol)}&apikey=${this.apiKey}`;

      const response = await fetch(url);

      if (!response.ok) {
        handleHttpStatus(response.status, symbol);
      }

      const data = (await response.json()) as
        | TwelveDataQuoteResponse
        | TwelveDataErrorResponse;

      if ("status" in data && data.status === "error") {
        handleApiError(data as TwelveDataErrorResponse, symbol);
      }

      const quote = data as TwelveDataQuoteResponse;

      const quoteData: QuoteData = {
        symbol: quote.symbol,
        price: parseFloat(quote.close),
        open: parseFloat(quote.open),
        high: parseFloat(quote.high),
        low: parseFloat(quote.low),
        close: parseFloat(quote.close),
        previousClose: parseFloat(quote.previous_close),
        change: parseFloat(quote.change),
        changePercent: parseFloat(quote.percent_change),
        volume: parseInt(quote.volume, 10) || undefined,
        timestamp: quote.timestamp
          ? new Date(quote.timestamp * 1000)
          : new Date(quote.datetime ?? Date.now()),
        currency: quote.currency || "USD",
      };

      return validateData(
        QuoteDataSchema,
        quoteData,
        `Twelve Data quote for ${symbol}`,
      );
    } catch (error) {
      if (error instanceof ProviderError) {
        throw error;
      }
      return this.handleHttpError(error, `fetchQuote(${symbol})`);
    }
  }

  async fetchHistoricalPrices(
    symbol: string,
    from: Date,
    to: Date,
  ): Promise<HistoricalPrice[]> {
    this.validateSymbol(symbol);

    try {
      const startDate = from.toISOString().split("T")[0];
      const endDate = to.toISOString().split("T")[0];

      const url =
        `${this.baseUrl}/time_series?symbol=${encodeURIComponent(symbol)}` +
        `&interval=1day&start_date=${startDate}&end_date=${endDate}` +
        `&apikey=${this.apiKey}`;

      const response = await fetch(url);

      if (!response.ok) {
        handleHttpStatus(response.status, symbol);
      }

      const data = (await response.json()) as TwelveDataTimeSeriesResponse;

      if (data.status === "error") {
        handleApiError(
          { code: data.code ?? 400, message: data.message ?? "Unknown error", status: "error" },
          symbol,
        );
      }

      if (!data.values || !Array.isArray(data.values) || data.values.length === 0) {
        return [];
      }

      return data.values.map((item) => ({
        date: item.datetime,
        open: parseFloat(item.open),
        high: parseFloat(item.high),
        low: parseFloat(item.low),
        close: parseFloat(item.close),
        volume: parseInt(item.volume, 10) || undefined,
      }));
    } catch (error) {
      if (error instanceof ProviderError) {
        throw error;
      }
      return this.handleHttpError(error, `fetchHistoricalPrices(${symbol})`);
    }
  }

  override async healthCheck(): Promise<boolean> {
    try {
      const url = `${this.baseUrl}/quote?symbol=AAPL&apikey=${this.apiKey}`;
      const response = await fetch(url);

      if (!response.ok) return false;

      const data = (await response.json()) as
        | TwelveDataQuoteResponse
        | TwelveDataErrorResponse;

      if ("status" in data && data.status === "error") return false;

      return true;
    } catch (error) {
      logger.error("[twelve-data] Health check failed:", error);
      return false;
    }
  }
}
