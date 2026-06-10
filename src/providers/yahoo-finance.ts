import { getLogger } from "../logging/index.js";
/**
 * Yahoo Finance Provider
 *
 * Implements the MarketDataProvider interface for Yahoo Finance API.
 * Free tier with no API key required, but has rate limits (~2000 calls/hour).
 */

import YahooFinance from "yahoo-finance2";
import { BaseProvider } from "./base-provider.js";
import type {
  QuoteData,
  DividendData,
  EventData,
  EarningsData,
  HistoricalPrice,
  DataType,
  RateLimitConfig,
} from "../types/index.js";
import { ProviderError, ProviderErrorCode } from "../types/provider.js";
import {
  QuoteDataSchema,
  DividendDataSchema,
  EventDataSchema,
  EarningsDataSchema,
  validateData,
} from "../types/validation.js";
import {
  type YahooHistoricalRow,
  type YahooQuoteLike,
  mapQuote,
  mapDividends,
  mapSplitEvents,
  mapHistorical,
} from "./yahoo-mappers.js";

const logger = getLogger("yahoo-finance", "provider-aggregator/providers");

// yahoo-finance2 v3 ships dual CJS/ESM with an awkward default export: under
// ESM the default is the class, but in a bundled-CJS consumer the interop
// wrapper nests it one level deeper (`{ default: class }`). Normalize so the
// constructor is recovered regardless of how the package was loaded.
type YahooFinanceCtor = typeof YahooFinance;
const ResolvedYahooFinance: YahooFinanceCtor =
  (YahooFinance as unknown as { default?: YahooFinanceCtor }).default ??
  YahooFinance;
const yahooFinance = new ResolvedYahooFinance();

export class YahooFinanceProvider extends BaseProvider {
  readonly name = "yahoo-finance";
  readonly supportedDataTypes: DataType[] = [
    "prices",
    "dividends",
    "earnings",
    "events",
  ];
  readonly rateLimit: RateLimitConfig = {
    requestsPerHour: 2000, // Yahoo Finance free tier limit
  };

  constructor(_credentials: Record<string, string> | null = null) {
    super();
    // Yahoo Finance doesn't require API key
  }

  /**
   * Fetch current stock quote
   */
  async fetchQuote(symbol: string): Promise<QuoteData> {
    this.validateSymbol(symbol);

    try {
      const normalizedSymbol = symbol.toUpperCase();
      const quote = await yahooFinance.quote(normalizedSymbol);

      if (!quote) {
        throw new ProviderError(
          ProviderErrorCode.SYMBOL_NOT_FOUND,
          `Symbol ${normalizedSymbol} not found`,
          false,
        );
      }

      // Check if price is valid (Yahoo Finance returns null for international symbols it can't price)
      if (quote.regularMarketPrice == null || quote.regularMarketPrice <= 0) {
        throw new ProviderError(
          ProviderErrorCode.SYMBOL_NOT_FOUND,
          `Invalid price for ${normalizedSymbol}: ${quote.regularMarketPrice}`,
          false,
        );
      }

      return validateData(
        QuoteDataSchema,
        // The lib's Quote type is broader than the subset we map; narrow it.
        mapQuote(quote as unknown as YahooQuoteLike, normalizedSymbol),
        `Yahoo Finance quote for ${symbol}`,
      );
    } catch (error) {
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

      // Use historical data endpoint for dividends
      const result = await yahooFinance.historical(normalizedSymbol, {
        period1: startDate || new Date(Date.now() - 365 * 24 * 60 * 60 * 1000), // Default: 1 year ago
        period2: endDate || new Date(),
        events: "dividends",
      });

      if (!result || !Array.isArray(result) || result.length === 0) {
        return []; // No dividends found (not an error)
      }

      return mapDividends(result as YahooHistoricalRow[]).map((div) =>
        validateData(
          DividendDataSchema,
          div,
          `Yahoo Finance dividend for ${symbol}`,
        ),
      );
    } catch (error) {
      return this.handleHttpError(error, `fetchDividends(${symbol})`);
    }
  }

  /**
   * Fetch corporate events (splits, etc.)
   */
  async fetchEvents(symbol: string): Promise<EventData[]> {
    this.validateSymbol(symbol);

    try {
      const normalizedSymbol = symbol.toUpperCase();

      // Use historical data endpoint for splits
      const result = await yahooFinance.historical(normalizedSymbol, {
        period1: new Date(Date.now() - 5 * 365 * 24 * 60 * 60 * 1000), // 5 years ago
        period2: new Date(),
        events: "split",
      });

      if (!result || !Array.isArray(result) || result.length === 0) {
        return []; // No events found
      }

      return mapSplitEvents(result as unknown as YahooHistoricalRow[]).map(
        (event) =>
          validateData(
            EventDataSchema,
            event,
            `Yahoo Finance event for ${symbol}`,
          ),
      );
    } catch (error) {
      return this.handleHttpError(error, `fetchEvents(${symbol})`);
    }
  }

  /**
   * Fetch earnings data
   *
   * Note: Yahoo Finance API does not provide revenue data in the earnings modules.
   * Revenue data is available in incomeStatementHistory/incomeStatementHistoryQuarterly
   * modules but would require additional API calls and matching logic. For revenue data,
   * prefer using FMP or Finnhub providers which include it directly in earnings responses.
   */
  async fetchEarnings(symbol: string): Promise<EarningsData[]> {
    this.validateSymbol(symbol);

    try {
      const normalizedSymbol = symbol.toUpperCase();

      // Use quoteSummary to get earnings calendar
      const result = await yahooFinance.quoteSummary(normalizedSymbol, {
        modules: ["earningsHistory", "earningsTrend"],
      });

      const earnings: EarningsData[] = [];

      // Parse earnings history
      if (result.earningsHistory?.history) {
        for (const item of result.earningsHistory.history) {
          if (item.quarter && item.epsActual !== undefined) {
            earnings.push({
              date: new Date(item.quarter),
              fiscalQuarter: `Q${item.quarter.getMonth() / 3 + 1}`,
              fiscalYear: item.quarter.getFullYear(),
              ...(item.epsEstimate !== undefined &&
                item.epsEstimate !== null && { estimate: item.epsEstimate }),
              ...(item.epsActual !== undefined &&
                item.epsActual !== null && { actual: item.epsActual }),
              ...(item.epsDifference !== undefined &&
                item.epsDifference !== null && {
                  surprise: item.epsDifference,
                }),
              ...(item.surprisePercent !== undefined &&
                item.surprisePercent !== null && {
                  surprisePercent: item.surprisePercent,
                }),
            });
          }
        }
      }

      // Parse upcoming earnings from trend
      if (result.earningsTrend?.trend) {
        for (const trend of result.earningsTrend.trend) {
          if (trend.period && trend.endDate) {
            earnings.push({
              date: new Date(trend.endDate),
              fiscalQuarter: trend.period,
              fiscalYear: new Date(trend.endDate).getFullYear(),
              ...(trend.earningsEstimate?.avg !== undefined &&
                trend.earningsEstimate.avg !== null && {
                  estimate: trend.earningsEstimate.avg,
                }),
            });
          }
        }
      }

      // Validate each earning
      return earnings.map((earning) =>
        validateData(
          EarningsDataSchema,
          earning,
          `Yahoo Finance earnings for ${symbol}`,
        ),
      );
    } catch (error) {
      return this.handleHttpError(error, `fetchEarnings(${symbol})`);
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

      const result = await yahooFinance.historical(normalizedSymbol, {
        period1: startDate,
        period2: endDate,
        interval: "1d",
      });

      if (!result || !Array.isArray(result) || result.length === 0) {
        return []; // No historical data found
      }

      return mapHistorical(result as YahooHistoricalRow[]);
    } catch (error) {
      return this.handleHttpError(error, `fetchHistoricalPrices(${symbol})`);
    }
  }

  /**
   * Health check - verify Yahoo Finance API is accessible
   */
  override async healthCheck(): Promise<boolean> {
    try {
      // Try to fetch a well-known symbol (Apple) as a health check
      await yahooFinance.quote("AAPL");
      return true;
    } catch (error) {
      logger.error("[yahoo-finance] Health check failed:", error);
      return false;
    }
  }
}
