/**
 * Financial Modeling Prep (FMP) Provider
 *
 * Implements the MarketDataProvider interface for FMP API.
 * Requires API key. Free tier: 250 calls/day.
 *
 * Thin HTTP/orchestration layer: response shapes live in `fmp-types.ts` and
 * pure transforms + status handling in `fmp-mappers.ts`. Plan-denied responses
 * throw ENTITLEMENT_REQUIRED so the aggregator falls back to other providers.
 */

import { getLogger } from "../logging/index.js";
import { ConfigurationError } from "../errors/index.js";
import { BaseProvider } from "./base-provider.js";
import { describeCaughtError } from "./provider-utils.js";
import { budgetedFetch } from "../resilience/request-budget.js";
import type {
  QuoteData,
  DividendData,
  EarningsData,
  RatingData,
  HistoricalPrice,
  CompanyProfile,
  NewsArticle,
  IpoEvent,
  SymbolSearchResult,
  InsiderTransaction,
  MarketMover,
  ForexRate,
  DataType,
  RateLimitConfig,
} from "../types/index.js";
import {
  fmpNews,
  fmpIpoCalendar,
  fmpSearch,
  fmpInsider,
  fmpMovers,
  fmpForexRate,
  type FmpGet,
} from "./fmp-extra.js";
import { ProviderError, ProviderErrorCode } from "../types/provider.js";
import {
  QuoteDataSchema,
  DividendDataSchema,
  EarningsDataSchema,
  RatingDataSchema,
  CompanyProfileSchema,
  validateData,
} from "../types/validation.js";
import type {
  FMPQuoteResponse,
  FMPDividend,
  FMPEarningsItem,
  FMPRating,
  FMPHistoricalItem,
  FMPProfile,
} from "./fmp-types.js";
import {
  parseFmpRows,
  mapQuote,
  mapDividends,
  mapEarnings,
  mapHistorical,
  mapRatingToConsensus,
  mapFmpProfile,
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
    "profile",
    "news",
    "ipo",
    "search",
    "insider",
    "movers",
    "forex_rate",
  ];
  readonly rateLimit: RateLimitConfig = {
    requestsPerDay: 250, // Free tier limit
  };
  readonly meteredPerHttpRequest = true;

  private apiKey: string;
  private host = "https://financialmodelingprep.com";

  /** Bound fetcher: appends the API key and returns parsed rows or throws. */
  private readonly getRows: FmpGet = async <T,>(
    apiPath: string,
    label: string,
    target: string,
  ): Promise<T[]> => {
    try {
      const separator = apiPath.includes("?") ? "&" : "?";
      const response = await budgetedFetch(
        `${this.host}${apiPath}${separator}apikey=${this.apiKey}`,
      );
      return await parseFmpRows<T>(response, {
        label,
        target,
        apiKey: this.apiKey,
      });
    } catch (error) {
      return this.handleHttpError(error, `FMP ${label}`, [this.apiKey]);
    }
  };

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
      const data = await this.getRows<FMPQuoteResponse>(
        `/stable/quote?symbol=${encodeURIComponent(normalizedSymbol)}`,
        "quote",
        symbol,
      );

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
      const data = await this.getRows<FMPDividend>(
        `/stable/dividends?symbol=${encodeURIComponent(normalizedSymbol)}`,
        "dividends",
        symbol,
      );

      return mapDividends(data, startDate, endDate).map((div) =>
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
      const data = await this.getRows<FMPEarningsItem>(
        `/stable/earnings?symbol=${encodeURIComponent(normalizedSymbol)}`,
        "earnings",
        symbol,
      );
      if (data.length === 0) return [];

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
      const data = await this.getRows<FMPRating>(
        `/stable/ratings-snapshot?symbol=${encodeURIComponent(normalizedSymbol)}`,
        "ratings",
        symbol,
      );
      const latest = data[0];
      if (!latest) return null;

      return validateData(
        RatingDataSchema,
        {
          consensus: mapRatingToConsensus(latest),
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
      const data = await this.getRows<FMPHistoricalItem>(
        `/stable/historical-price-eod/full?symbol=${encodeURIComponent(normalizedSymbol)}&from=${from}&to=${to}`,
        "historical prices",
        symbol,
      );
      return mapHistorical(data);
    } catch (error) {
      return this.handleHttpError(error, `fetchHistoricalPrices(${symbol})`);
    }
  }

  async fetchProfile(symbol: string): Promise<CompanyProfile | null> {
    this.validateSymbol(symbol);
    try {
      const normalizedSymbol = symbol.toUpperCase();
      const data = await this.getRows<FMPProfile>(
        `/stable/profile?symbol=${encodeURIComponent(normalizedSymbol)}`,
        "profile",
        symbol,
      );
      const profile = data[0];
      if (!profile) return null;

      return validateData(
        CompanyProfileSchema,
        mapFmpProfile(profile, normalizedSymbol),
        `FMP profile for ${symbol}`,
      );
    } catch (error) {
      return this.handleHttpError(error, `fetchProfile(${symbol})`);
    }
  }

  fetchNews(symbol: string): Promise<NewsArticle[]> {
    this.validateSymbol(symbol);
    return fmpNews(this.getRows, symbol);
  }

  fetchIpoCalendar(): Promise<IpoEvent[]> {
    return fmpIpoCalendar(this.getRows);
  }

  searchSymbols(query: string): Promise<SymbolSearchResult[]> {
    return fmpSearch(this.getRows, query);
  }

  fetchInsiderTransactions(symbol: string): Promise<InsiderTransaction[]> {
    this.validateSymbol(symbol);
    return fmpInsider(this.getRows, symbol);
  }

  fetchMarketMovers(
    direction: "gainers" | "losers" | "actives",
  ): Promise<MarketMover[]> {
    return fmpMovers(this.getRows, direction);
  }

  fetchForexRate(from: string, to: string): Promise<ForexRate | null> {
    return fmpForexRate(this.getRows, from, to);
  }

  override async healthCheck(): Promise<boolean> {
    try {
      const response = await budgetedFetch(
        `${this.host}/stable/quote?symbol=AAPL&apikey=${this.apiKey}`,
      );
      if (response.status === 403) {
        logger.warn(
          "[fmp] Health check returned 403 - API key may be invalid or paid plan required",
        );
        return false;
      }
      return response.ok;
    } catch (error) {
      logger.error("[fmp] Health check failed", {
        error: describeCaughtError(error, [this.apiKey]),
      });
      return false;
    }
  }
}
