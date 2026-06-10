import { getLogger } from "../logging/index.js";
import { ConfigurationError } from "../errors/index.js";
/**
 * Alpha Vantage Provider
 *
 * Implements the MarketDataProvider interface for Alpha Vantage API.
 * Requires API key. Free tier: 5 calls/minute, 500 calls/day.
 *
 * Note: Dividend data requires premium API access (TIME_SERIES_DAILY_ADJUSTED).
 * For dividends, prefer Yahoo Finance, FMP, or Finnhub providers.
 */

import { BaseProvider } from "./base-provider.js";
import type {
  QuoteData,
  DividendData,
  EarningsData,
  EventData,
  DataType,
  RateLimitConfig,
} from "../types/index.js";
import { ProviderError, ProviderErrorCode } from "../types/provider.js";
import {
  QuoteDataSchema,
  EarningsDataSchema,
  validateData,
} from "../types/validation.js";
import type {
  AlphaVantageQuoteResponse,
  AlphaVantageEarningsResponse,
  AlphaVantageEarningsItem,
} from "./alpha-vantage-types.js";

const logger = getLogger("alpha-vantage", "provider-aggregator/providers");

export class AlphaVantageProvider extends BaseProvider {
  readonly name = "alpha-vantage";
  readonly supportedDataTypes: DataType[] = ["prices", "dividends", "earnings"];
  readonly rateLimit: RateLimitConfig = {
    requestsPerMinute: 5, // Free tier limit
    requestsPerDay: 500,
  };

  private apiKey: string;
  private baseUrl = "https://www.alphavantage.co/query";

  constructor(credentials: Record<string, string> | null) {
    super();

    const apiKey = credentials?.api_key;
    if (!apiKey) {
      throw new ConfigurationError("Alpha Vantage API key is required");
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
      const url = `${this.baseUrl}?function=GLOBAL_QUOTE&symbol=${normalizedSymbol}&apikey=${this.apiKey}`;

      const response = await fetch(url);

      if (!response.ok) {
        if (response.status === 429) {
          throw new ProviderError(
            ProviderErrorCode.RATE_LIMIT_EXCEEDED,
            "Alpha Vantage rate limit exceeded",
            true,
            60,
          );
        }

        throw new ProviderError(
          ProviderErrorCode.NETWORK_ERROR,
          `Alpha Vantage API returned ${response.status}`,
          true,
        );
      }

      const data = (await response.json()) as AlphaVantageQuoteResponse;

      const quote = data["Global Quote"];
      if (!quote || Object.keys(quote).length === 0) {
        throw new ProviderError(
          ProviderErrorCode.SYMBOL_NOT_FOUND,
          `Symbol ${normalizedSymbol} not found`,
          false,
        );
      }

      const quoteData: QuoteData = {
        symbol: normalizedSymbol,
        price: parseFloat(quote["05. price"]),
        open: parseFloat(quote["02. open"]),
        high: parseFloat(quote["03. high"]),
        low: parseFloat(quote["04. low"]),
        previousClose: parseFloat(quote["08. previous close"]),
        change: parseFloat(quote["09. change"]),
        changePercent: parseFloat(quote["10. change percent"].replace("%", "")),
        volume: parseInt(quote["06. volume"]),
        timestamp: new Date(quote["07. latest trading day"]),
        currency: "USD",
      };

      // Validate the response
      return validateData(
        QuoteDataSchema,
        quoteData,
        `Alpha Vantage quote for ${symbol}`,
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
    _startDate?: Date,
    _endDate?: Date,
  ): Promise<DividendData[]> {
    this.validateSymbol(symbol);

    try {
      const normalizedSymbol = symbol.toUpperCase();
      // Alpha Vantage uses CASH_FLOW endpoint which includes dividend data
      const url = `${this.baseUrl}?function=CASH_FLOW&symbol=${normalizedSymbol}&apikey=${this.apiKey}`;

      const response = await fetch(url);

      if (!response.ok) {
        if (response.status === 429) {
          throw new ProviderError(
            ProviderErrorCode.RATE_LIMIT_EXCEEDED,
            "Alpha Vantage rate limit exceeded",
            true,
            60,
          );
        }
        throw new ProviderError(
          ProviderErrorCode.NETWORK_ERROR,
          `Alpha Vantage API returned ${response.status}`,
          true,
        );
      }

      // Alpha Vantage doesn't have a direct dividend endpoint in free tier
      // The CASH_FLOW endpoint doesn't contain individual dividend payments
      // For production, use TIME_SERIES_DAILY_ADJUSTED which requires premium
      // For now, return empty array with a warning
      logger.warn(
        `[alpha-vantage] Dividend data requires premium API access for ${normalizedSymbol}`,
      );
      return [];
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
      const url = `${this.baseUrl}?function=EARNINGS&symbol=${normalizedSymbol}&apikey=${this.apiKey}`;

      const response = await fetch(url);

      if (!response.ok) {
        if (response.status === 429) {
          throw new ProviderError(
            ProviderErrorCode.RATE_LIMIT_EXCEEDED,
            "Alpha Vantage rate limit exceeded",
            true,
            60,
          );
        }
        throw new ProviderError(
          ProviderErrorCode.NETWORK_ERROR,
          `Alpha Vantage API returned ${response.status}`,
          true,
        );
      }

      const data = (await response.json()) as AlphaVantageEarningsResponse;

      if (!data.quarterlyEarnings || !Array.isArray(data.quarterlyEarnings)) {
        return []; // No earnings found
      }

      // Transform Alpha Vantage earnings data
      const earnings: EarningsData[] = data.quarterlyEarnings.map(
        (item: AlphaVantageEarningsItem) => {
          const date = new Date(item.reportedDate || item.fiscalDateEnding);
          const fiscalYear = parseInt(item.fiscalDateEnding.split("-")[0]!);

          // Extract quarter number from fiscalDateEnding (YYYY-MM-DD)
          const month = parseInt(item.fiscalDateEnding.split("-")[1]!);
          const quarter = Math.ceil(month / 3);

          return {
            date,
            fiscalQuarter: `Q${quarter}`,
            fiscalYear,
            ...(item.estimatedEPS !== "None" &&
              item.estimatedEPS !== null && {
                estimate: parseFloat(item.estimatedEPS),
              }),
            ...(item.reportedEPS !== "None" &&
              item.reportedEPS !== null && {
                actual: parseFloat(item.reportedEPS),
              }),
            ...(item.surprise !== "None" &&
              item.surprise !== null && {
                surprise: parseFloat(item.surprise),
              }),
            ...(item.surprisePercentage !== "None" &&
              item.surprisePercentage !== null && {
                surprisePercent: parseFloat(item.surprisePercentage),
              }),
          };
        },
      );

      // Validate each earning
      return earnings.map((earning) =>
        validateData(
          EarningsDataSchema,
          earning,
          `Alpha Vantage earnings for ${symbol}`,
        ),
      );
    } catch (error) {
      if (error instanceof ProviderError) {
        throw error;
      }
      return this.handleHttpError(error, `fetchEarnings(${symbol})`);
    }
  }

  /**
   * Fetch corporate events
   *
   * Note: Alpha Vantage does not provide a corporate events endpoint.
   * For events data, use Yahoo Finance or FMP providers instead.
   */
  async fetchEvents(symbol: string): Promise<EventData[]> {
    this.validateSymbol(symbol);

    try {
      const normalizedSymbol = symbol.toUpperCase();

      // Alpha Vantage API limitations:
      // - No stock splits endpoint
      // - No corporate events endpoint
      // - Would need to parse from news or company overview
      //
      // Recommendation: Use YahooFinanceProvider for event data
      logger.debug(
        `[alpha-vantage] Events not available for ${normalizedSymbol} - use Yahoo Finance provider instead`,
      );
      return [];
    } catch (error) {
      return this.handleHttpError(error, `fetchEvents(${symbol})`);
    }
  }

  /**
   * Health check - verify Alpha Vantage API is accessible
   */
  override async healthCheck(): Promise<boolean> {
    try {
      const url = `${this.baseUrl}?function=GLOBAL_QUOTE&symbol=AAPL&apikey=${this.apiKey}`;
      const response = await fetch(url);
      return response.ok;
    } catch (error) {
      logger.error("[alpha-vantage] Health check failed:", error);
      return false;
    }
  }
}
