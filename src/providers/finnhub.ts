/**
 * Finnhub Provider
 *
 * Implements the MarketDataProvider interface for the Finnhub REST API
 * (https://finnhub.io/api/v1). Requires an API key. Free tier: 60 calls/min.
 *
 * Uses native fetch (no SDK) so the package carries no axios dependency.
 * Response shapes live in `finnhub-types.ts`, pure transforms in
 * `finnhub-mappers.ts`. Resilience (circuit breaking) is applied uniformly by
 * the aggregator around every call.
 */

import { getLogger } from "../logging/index.js";
import { ConfigurationError } from "../errors/index.js";
import { BaseProvider } from "./base-provider.js";
import type {
  QuoteData,
  DividendData,
  EventData,
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
  EventDataSchema,
  EarningsDataSchema,
  RatingDataSchema,
  validateData,
} from "../types/validation.js";
import type {
  FinnhubQuote,
  FinnhubDividend,
  FinnhubNews,
  FinnhubEarningsResponse,
  FinnhubRecommendation,
  FinnhubPriceTarget,
  FinnhubCandles,
} from "./finnhub-types.js";
import {
  mapFinnhubError,
  mapQuote,
  mapDividends,
  detectEvents,
  mapEarnings,
  buildRating,
  mapCandles,
} from "./finnhub-mappers.js";

const logger = getLogger("finnhub", "provider-aggregator/providers");
const FINNHUB_BASE_URL = "https://finnhub.io/api/v1";

/** Format a date as YYYY-MM-DD (Finnhub's expected query format). */
function ymd(date: Date): string {
  return date.toISOString().split("T")[0]!;
}

export class FinnhubProvider extends BaseProvider {
  readonly name = "finnhub";
  readonly supportedDataTypes: DataType[] = [
    "prices",
    "dividends",
    "earnings",
    "events",
    "ratings",
  ];
  readonly rateLimit: RateLimitConfig = {
    requestsPerMinute: 60, // Free tier limit
  };

  private apiKey: string;

  constructor(credentials: Record<string, string> | null) {
    super();
    const apiKey = credentials?.api_key;
    if (!apiKey) {
      throw new ConfigurationError("Finnhub API key is required");
    }
    this.apiKey = apiKey;
  }

  /** GET a Finnhub endpoint and parse JSON. Throws on a non-2xx response. */
  private async get<T>(
    path: string,
    params: Record<string, string | number>,
  ): Promise<T> {
    const qs = new URLSearchParams(
      Object.entries(params).map(([k, v]): [string, string] => [k, String(v)]),
    ).toString();
    const response = await fetch(`${FINNHUB_BASE_URL}${path}?${qs}`, {
      headers: { "X-Finnhub-Token": this.apiKey },
    });
    if (!response.ok) {
      throw new ProviderError(
        ProviderErrorCode.NETWORK_ERROR,
        `Finnhub API returned ${response.status}`,
        true,
      );
    }
    return (await response.json()) as T;
  }

  async fetchQuote(symbol: string): Promise<QuoteData> {
    this.validateSymbol(symbol);
    const normalizedSymbol = symbol.toUpperCase();
    const quote = await this.get<FinnhubQuote>("/quote", {
      symbol: normalizedSymbol,
    });
    if (!quote || !quote.c) {
      throw new ProviderError(
        ProviderErrorCode.SYMBOL_NOT_FOUND,
        `Symbol ${normalizedSymbol} not found or no data available`,
        false,
      );
    }
    return validateData(
      QuoteDataSchema,
      mapQuote(quote, normalizedSymbol),
      `Finnhub quote for ${symbol}`,
    );
  }

  async fetchDividends(
    symbol: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<DividendData[]> {
    this.validateSymbol(symbol);
    try {
      const symbolUpper = symbol.toUpperCase();
      const from = ymd(
        startDate ?? new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
      );
      const to = ymd(endDate ?? new Date());

      const dividends = await this.get<FinnhubDividend[]>("/stock/dividend", {
        symbol: symbolUpper,
        from,
        to,
      });
      if (!Array.isArray(dividends) || dividends.length === 0) return [];

      return mapDividends(dividends).map((div) =>
        validateData(DividendDataSchema, div, `Finnhub dividend for ${symbol}`),
      );
    } catch (error) {
      return mapFinnhubError(error, `fetchDividends(${symbol})`);
    }
  }

  /**
   * Fetch corporate events by keyword-matching company news. Less reliable than
   * providers with direct corporate-actions data (prefer Yahoo Finance).
   */
  async fetchEvents(symbol: string): Promise<EventData[]> {
    this.validateSymbol(symbol);
    try {
      const symbolUpper = symbol.toUpperCase();
      const from = ymd(new Date(Date.now() - 365 * 24 * 60 * 60 * 1000));
      const to = ymd(new Date());

      const news = await this.get<FinnhubNews[]>("/company-news", {
        symbol: symbolUpper,
        from,
        to,
      });
      if (!Array.isArray(news) || news.length === 0) return [];

      return detectEvents(news).map((event) =>
        validateData(EventDataSchema, event, `Finnhub event for ${symbol}`),
      );
    } catch (error) {
      return mapFinnhubError(error, `fetchEvents(${symbol})`);
    }
  }

  /** Fetch earnings (historical + upcoming) via the earnings calendar. */
  async fetchEarnings(symbol: string): Promise<EarningsData[]> {
    this.validateSymbol(symbol);
    try {
      const symbolUpper = symbol.toUpperCase();
      const now = new Date();
      const fromDate = new Date(now);
      fromDate.setMonth(fromDate.getMonth() - 6);
      const toDate = new Date(now);
      toDate.setMonth(toDate.getMonth() + 6);

      const data = await this.get<FinnhubEarningsResponse>(
        "/calendar/earnings",
        { from: ymd(fromDate), to: ymd(toDate), symbol: symbolUpper },
      );
      const calendarData = data.earningsCalendar ?? [];

      logger.debug("Finnhub earningsCalendar response", {
        symbol: symbolUpper,
        count: calendarData.length,
      });
      if (calendarData.length === 0) return [];

      return mapEarnings(calendarData).map((earning) =>
        validateData(
          EarningsDataSchema,
          earning,
          `Finnhub earnings for ${symbol}`,
        ),
      );
    } catch (error) {
      return mapFinnhubError(error, `fetchEarnings(${symbol})`);
    }
  }

  async fetchRatings(symbol: string): Promise<RatingData | null> {
    this.validateSymbol(symbol);
    try {
      const symbolUpper = symbol.toUpperCase();
      const recommendations = await this.get<FinnhubRecommendation[]>(
        "/stock/recommendation",
        { symbol: symbolUpper },
      );
      const latest = recommendations?.[0];
      if (!Array.isArray(recommendations) || !latest) {
        throw new ProviderError(
          ProviderErrorCode.PROVIDER_ERROR,
          "No ratings data available",
          false,
        );
      }

      const target = await this.get<FinnhubPriceTarget>(
        "/stock/price-target",
        { symbol: symbolUpper },
      );
      return validateData(
        RatingDataSchema,
        buildRating(latest, target),
        `Finnhub ratings for ${symbol}`,
      );
    } catch (error) {
      return mapFinnhubError(error, `fetchRatings(${symbol})`);
    }
  }

  async fetchHistoricalPrices(
    symbol: string,
    startDate: Date,
    endDate: Date,
  ): Promise<HistoricalPrice[]> {
    this.validateSymbol(symbol);
    try {
      const candles = await this.get<FinnhubCandles>("/stock/candle", {
        symbol: symbol.toUpperCase(),
        resolution: "D",
        from: Math.floor(startDate.getTime() / 1000),
        to: Math.floor(endDate.getTime() / 1000),
      });
      if (candles.s !== "ok" || !candles.t || candles.t.length === 0) {
        return [];
      }
      return mapCandles(candles);
    } catch (error) {
      return mapFinnhubError(error, `fetchHistoricalPrices(${symbol})`);
    }
  }

  override async healthCheck(): Promise<boolean> {
    try {
      await this.get<FinnhubQuote>("/quote", { symbol: "AAPL" });
      return true;
    } catch (error) {
      logger.error("[finnhub] Health check failed:", error);
      return false;
    }
  }
}
