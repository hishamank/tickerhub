/**
 * Finnhub Provider
 *
 * Implements the MarketDataProvider interface for Finnhub API.
 * Requires API key. Free tier: 60 calls/minute, paid tiers available.
 *
 * Thin HTTP/orchestration layer: response shapes live in `finnhub-types.ts`
 * and pure transforms in `finnhub-mappers.ts`. Resilience (retry + circuit
 * breaking) is applied uniformly by the aggregator around every call.
 */

import { getLogger } from "../logging/index.js";
import { ConfigurationError } from "../errors/index.js";
import { DefaultApi, Configuration } from "finnhub-ts";
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
import {
  unwrapData,
  type FinnhubQuote,
  type FinnhubDividend,
  type FinnhubNews,
  type FinnhubEarningsResponse,
  type FinnhubRecommendation,
  type FinnhubPriceTarget,
  type FinnhubCandles,
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

  private client: DefaultApi;

  constructor(credentials: Record<string, string> | null) {
    super();
    const apiKey = credentials?.api_key;
    if (!apiKey) {
      throw new ConfigurationError("Finnhub API key is required");
    }
    this.client = new DefaultApi(new Configuration({ apiKey }));
  }

  async fetchQuote(symbol: string): Promise<QuoteData> {
    this.validateSymbol(symbol);
    const normalizedSymbol = symbol.toUpperCase();
    const quote = unwrapData<FinnhubQuote>(
      await this.client.quote(normalizedSymbol),
    );
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
      const normalizedSymbol = symbol.toUpperCase();
      const from = ymd(
        startDate ?? new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
      );
      const to = ymd(endDate ?? new Date());

      const dividends = unwrapData<FinnhubDividend[]>(
        await this.client.stockDividends(normalizedSymbol, from, to),
      );
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
      const normalizedSymbol = symbol.toUpperCase();
      const from = ymd(new Date(Date.now() - 365 * 24 * 60 * 60 * 1000));
      const to = ymd(new Date());

      const news = unwrapData<FinnhubNews[]>(
        await this.client.companyNews(normalizedSymbol, from, to),
      );
      if (!Array.isArray(news) || news.length === 0) return [];

      return detectEvents(news).map((event) =>
        validateData(EventDataSchema, event, `Finnhub event for ${symbol}`),
      );
    } catch (error) {
      return mapFinnhubError(error, `fetchEvents(${symbol})`);
    }
  }

  /** Fetch earnings (historical + upcoming) via the earningsCalendar endpoint. */
  async fetchEarnings(symbol: string): Promise<EarningsData[]> {
    this.validateSymbol(symbol);
    try {
      const normalizedSymbol = symbol.toUpperCase();
      const now = new Date();
      const fromDate = new Date(now);
      fromDate.setMonth(fromDate.getMonth() - 6);
      const toDate = new Date(now);
      toDate.setMonth(toDate.getMonth() + 6);

      const calendarData =
        unwrapData<FinnhubEarningsResponse>(
          await this.client.earningsCalendar(
            ymd(fromDate),
            ymd(toDate),
            normalizedSymbol,
          ),
        ).earningsCalendar ?? [];

      logger.debug("Finnhub earningsCalendar response", {
        symbol: normalizedSymbol,
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
      const normalizedSymbol = symbol.toUpperCase();
      const recommendations = unwrapData<FinnhubRecommendation[]>(
        await this.client.recommendationTrends(normalizedSymbol),
      );
      const latest = recommendations?.[0];
      if (!Array.isArray(recommendations) || !latest) {
        throw new ProviderError(
          ProviderErrorCode.PROVIDER_ERROR,
          "No ratings data available",
          false,
        );
      }

      const target = unwrapData<FinnhubPriceTarget>(
        await this.client.priceTarget(normalizedSymbol),
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
      const normalizedSymbol = symbol.toUpperCase();
      const from = Math.floor(startDate.getTime() / 1000);
      const to = Math.floor(endDate.getTime() / 1000);

      const candles = unwrapData<FinnhubCandles>(
        await this.client.stockCandles(normalizedSymbol, "D", from, to),
      );
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
      await this.client.quote("AAPL");
      return true;
    } catch (error) {
      logger.error("[finnhub] Health check failed:", error);
      return false;
    }
  }
}
