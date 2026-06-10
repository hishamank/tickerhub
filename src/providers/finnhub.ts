import { getLogger } from "../logging/index.js";
import { ConfigurationError } from "../errors/index.js";
/**
 * Finnhub Provider
 *
 * Implements the MarketDataProvider interface for Finnhub API.
 * Requires API key. Free tier: 60 calls/minute, paid tiers available.
 *
 * Resilience (retry + circuit breaking) is applied uniformly by the aggregator
 * around every provider call, so providers themselves stay thin.
 */

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

const logger = getLogger(
  "finnhub",
  "packages/provider-aggregator/src/providers/finnhub.ts",
);

/**
 * Unwrap an axios-style `{ data }` envelope, falling back to the value itself.
 * The finnhub-ts client returns responses in either shape depending on version.
 */
function unwrapData<T>(response: unknown): T {
  if (response && typeof response === "object" && "data" in response) {
    const d = (response as { data: unknown }).data;
    if (d !== undefined && d !== null) return d as T;
  }
  return response as T;
}

interface FinnhubQuote {
  c: number;
  o: number;
  h: number;
  l: number;
  pc: number;
  t: number;
}

interface FinnhubDividend {
  date: string;
  amount: number;
  currency?: string;
  payDate?: string;
}

interface FinnhubNews {
  headline: string;
  summary: string;
  url: string;
  datetime: number;
}

interface FinnhubEarningsItem {
  date: string;
  quarter: number;
  year: number;
  epsEstimate?: number | null;
  epsActual?: number | null;
  revenueEstimate?: number | null;
  revenueActual?: number | null;
}

interface FinnhubEarningsResponse {
  earningsCalendar?: FinnhubEarningsItem[];
}

interface FinnhubRecommendation {
  strongBuy: number;
  buy: number;
  hold: number;
  sell: number;
  strongSell: number;
}

interface FinnhubPriceTarget {
  targetMean?: number;
  targetHigh?: number;
  targetLow?: number;
}

interface FinnhubCandles {
  s: string;
  t: number[];
  o: number[];
  h: number[];
  l: number[];
  c: number[];
  v: number[];
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

    const config = new Configuration({
      apiKey,
    });

    this.client = new DefaultApi(config);
  }

  /**
   * Fetch current stock quote
   * Uses resilience patterns for retry and circuit breaker
   */
  async fetchQuote(symbol: string): Promise<QuoteData> {
    this.validateSymbol(symbol);
    const normalizedSymbol = symbol.toUpperCase();

    const response = await this.client.quote(normalizedSymbol);
    const quote = unwrapData<FinnhubQuote>(response);

    if (!quote || !quote.c) {
      throw new ProviderError(
        ProviderErrorCode.SYMBOL_NOT_FOUND,
        `Symbol ${normalizedSymbol} not found or no data available`,
        false,
      );
    }

    // Finnhub quote response:
    // c: current price, h: high, l: low, o: open, pc: previous close,
    // t: timestamp (Unix seconds)
    const quoteData: QuoteData = {
      symbol: normalizedSymbol,
      price: quote.c,
      open: quote.o,
      high: quote.h,
      low: quote.l,
      previousClose: quote.pc,
      change: quote.c - quote.pc,
      changePercent: ((quote.c - quote.pc) / quote.pc) * 100,
      timestamp: new Date(quote.t * 1000), // Convert Unix seconds to Date
      currency: "USD", // Finnhub primarily provides US market data
    };

    return validateData(
      QuoteDataSchema,
      quoteData,
      `Finnhub quote for ${symbol}`,
    );
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

      // Calculate date range (default: 1 year)
      const from = (
        startDate
          ? startDate.toISOString().split("T")[0]
          : new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)
              .toISOString()
              .split("T")[0]
      )!;
      const to = (
        endDate
          ? endDate.toISOString().split("T")[0]
          : new Date().toISOString().split("T")[0]
      )!;

      // Finnhub dividends endpoint: /stock/dividend
      const response = await this.client.stockDividends(
        normalizedSymbol,
        from,
        to,
      );
      const dividends = unwrapData<FinnhubDividend[]>(response);

      if (!Array.isArray(dividends) || dividends.length === 0) {
        return []; // No dividends found
      }

      // Transform Finnhub response to DividendData
      const result: DividendData[] = dividends.map((div: FinnhubDividend) => ({
        exDate: new Date(div.date),
        amount: div.amount,
        currency: div.currency || "USD",
        ...(div.payDate && { paymentDate: new Date(div.payDate) }),
      }));

      // Validate each dividend
      return result.map((div) =>
        validateData(DividendDataSchema, div, `Finnhub dividend for ${symbol}`),
      );
    } catch (error) {
      if (error instanceof Error && error.message.includes("429")) {
        throw new ProviderError(
          ProviderErrorCode.RATE_LIMIT_EXCEEDED,
          "Finnhub rate limit exceeded",
          true,
          60,
        );
      }
      return this.handleHttpError(error, `fetchDividends(${symbol})`);
    }
  }

  /**
   * Fetch corporate events
   *
   * Note: Finnhub does not provide a dedicated stock splits/corporate events API.
   * This implementation uses company news to detect major corporate events by
   * keyword matching. This approach is less reliable than providers with direct
   * access to corporate actions data (like Yahoo Finance).
   *
   * For production use, prefer Yahoo Finance provider for event data.
   */
  async fetchEvents(symbol: string): Promise<EventData[]> {
    this.validateSymbol(symbol);

    try {
      const normalizedSymbol = symbol.toUpperCase();

      // Fetch news from past year to detect corporate events
      const to = new Date();
      const from = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
      const fromStr = from.toISOString().split("T")[0]!;
      const toStr = to.toISOString().split("T")[0]!;

      const response = await this.client.companyNews(
        normalizedSymbol,
        fromStr,
        toStr,
      );
      const news = unwrapData<FinnhubNews[]>(response);

      if (!Array.isArray(news) || news.length === 0) {
        return [];
      }

      const events: EventData[] = [];

      // Parse news headlines for corporate events
      for (const article of news) {
        const headline = (article.headline || "").toLowerCase();
        const summary = (article.summary || "").toLowerCase();
        const text = `${headline} ${summary}`;
        const date = new Date(article.datetime * 1000);

        // Detect stock splits
        if (
          text.includes("stock split") &&
          !text.includes("reverse") &&
          !events.some(
            (e) => e.type === "split" && this.isSameDay(e.date, date),
          )
        ) {
          events.push({
            type: "split",
            date,
            description: article.headline,
            details: {
              source: "news",
              url: article.url,
            },
          });
        }

        // Detect reverse splits
        if (
          (text.includes("reverse split") ||
            text.includes("reverse stock split")) &&
          !events.some(
            (e) => e.type === "reverse_split" && this.isSameDay(e.date, date),
          )
        ) {
          events.push({
            type: "reverse_split",
            date,
            description: article.headline,
            details: {
              source: "news",
              url: article.url,
            },
          });
        }

        // Detect mergers
        if (
          (text.includes("merger") ||
            text.includes("acquire") ||
            text.includes("acquisition")) &&
          !events.some(
            (e) => e.type === "merger" && this.isSameDay(e.date, date),
          )
        ) {
          const type = text.includes("merger") ? "merger" : "acquisition";
          events.push({
            type,
            date,
            description: article.headline,
            details: {
              source: "news",
              url: article.url,
            },
          });
        }
      }

      // Validate events
      return events.map((event) =>
        validateData(EventDataSchema, event, `Finnhub event for ${symbol}`),
      );
    } catch (error) {
      if (error instanceof Error && error.message.includes("429")) {
        throw new ProviderError(
          ProviderErrorCode.RATE_LIMIT_EXCEEDED,
          "Finnhub rate limit exceeded",
          true,
          60,
        );
      }
      return this.handleHttpError(error, `fetchEvents(${symbol})`);
    }
  }

  /**
   * Helper to check if two dates are the same day
   */
  private isSameDay(date1: Date, date2: Date): boolean {
    return (
      date1.getFullYear() === date2.getFullYear() &&
      date1.getMonth() === date2.getMonth() &&
      date1.getDate() === date2.getDate()
    );
  }

  /**
   * Helper to check if a date is a quarter-end placeholder date
   * Finnhub returns quarter-end dates (Mar 31, Jun 30, Sep 30, Dec 31) as placeholders
   * when the actual earnings announcement date is unknown
   */
  private isQuarterEndDate(date: Date): boolean {
    const month = date.getUTCMonth(); // 0-indexed: 0=Jan, 2=Mar, 5=Jun, 8=Sep, 11=Dec
    const day = date.getUTCDate();

    // Quarter-end months: March (2), June (5), September (8), December (11)
    const isQuarterEndMonth =
      month === 2 || month === 5 || month === 8 || month === 11;

    if (!isQuarterEndMonth) return false;

    // Check if it's the last day of the month
    const lastDayOfMonth = new Date(
      Date.UTC(date.getUTCFullYear(), month + 1, 0),
    ).getUTCDate();
    return day === lastDayOfMonth;
  }

  /**
   * Get quarter label from month (for tentative quarter display)
   */
  private getQuarterFromMonth(date: Date): string {
    const month = date.getUTCMonth(); // 0-indexed
    if (month <= 2) return "Q1";
    if (month <= 5) return "Q2";
    if (month <= 8) return "Q3";
    return "Q4";
  }

  /**
   * Fetch earnings data (both historical and upcoming)
   * Uses earningsCalendar endpoint for upcoming earnings dates
   */
  async fetchEarnings(symbol: string): Promise<EarningsData[]> {
    this.validateSymbol(symbol);

    try {
      const normalizedSymbol = symbol.toUpperCase();

      // Get date range: 6 months back and 6 months forward
      const now = new Date();
      const fromDate = new Date(now);
      fromDate.setMonth(fromDate.getMonth() - 6);
      const toDate = new Date(now);
      toDate.setMonth(toDate.getMonth() + 6);

      const from = fromDate.toISOString().split("T")[0];
      const to = toDate.toISOString().split("T")[0];

      // Use earningsCalendar endpoint which includes upcoming earnings
      const response = await this.client.earningsCalendar(
        from,
        to,
        normalizedSymbol,
      );
      const calendarData =
        unwrapData<FinnhubEarningsResponse>(response).earningsCalendar ?? [];

      logger.debug("Finnhub earningsCalendar response", {
        symbol: normalizedSymbol,
        from,
        to,
        count: calendarData.length,
      });

      if (!Array.isArray(calendarData) || calendarData.length === 0) {
        return []; // No earnings found
      }

      // Transform Finnhub earningsCalendar response to EarningsData
      const result: EarningsData[] = calendarData.map((item: FinnhubEarningsItem) => {
        const earningsDate = new Date(item.date);
        const isQuarterEnd = this.isQuarterEndDate(earningsDate);
        const tentativeQuarter = isQuarterEnd
          ? this.getQuarterFromMonth(earningsDate)
          : undefined;

        return {
          date: earningsDate,
          fiscalQuarter: item.quarter ? `Q${item.quarter}` : "Unknown",
          fiscalYear: item.year,
          // Mark quarter-end dates as unconfirmed (Finnhub placeholder)
          confirmed: !isQuarterEnd,
          tentativeQuarter,
          // EPS data
          ...(item.epsEstimate !== undefined &&
            item.epsEstimate !== null && { estimate: item.epsEstimate }),
          ...(item.epsActual !== undefined &&
            item.epsActual !== null && { actual: item.epsActual }),
          // Calculate surprise if both values exist
          ...(item.epsActual !== undefined &&
            item.epsEstimate !== undefined &&
            item.epsActual !== null &&
            item.epsEstimate !== null && {
              surprise: item.epsActual - item.epsEstimate,
            }),
          ...(item.epsActual !== undefined &&
            item.epsEstimate !== undefined &&
            item.epsActual !== null &&
            item.epsEstimate !== null &&
            item.epsEstimate !== 0 && {
              surprisePercent:
                ((item.epsActual - item.epsEstimate) /
                  Math.abs(item.epsEstimate)) *
                100,
            }),
          // Revenue data
          ...(item.revenueEstimate !== undefined &&
            item.revenueEstimate !== null && {
              revenueEstimate: item.revenueEstimate,
            }),
          ...(item.revenueActual !== undefined &&
            item.revenueActual !== null && {
              revenueActual: item.revenueActual,
            }),
          // Calculate revenue surprise if both values exist
          ...(item.revenueActual !== undefined &&
            item.revenueEstimate !== undefined &&
            item.revenueActual !== null &&
            item.revenueEstimate !== null && {
              revenueSurprise: item.revenueActual - item.revenueEstimate,
            }),
          ...(item.revenueActual !== undefined &&
            item.revenueEstimate !== undefined &&
            item.revenueActual !== null &&
            item.revenueEstimate !== null &&
            item.revenueEstimate !== 0 && {
              revenueSurprisePercent:
                ((item.revenueActual - item.revenueEstimate) /
                  Math.abs(item.revenueEstimate)) *
                100,
            }),
        };
      });

      // Validate each earning
      return result.map((earning) =>
        validateData(
          EarningsDataSchema,
          earning,
          `Finnhub earnings for ${symbol}`,
        ),
      );
    } catch (error) {
      if (error instanceof Error && error.message.includes("429")) {
        throw new ProviderError(
          ProviderErrorCode.RATE_LIMIT_EXCEEDED,
          "Finnhub rate limit exceeded",
          true,
          60,
        );
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

      // Finnhub recommendation trends endpoint
      const response = await this.client.recommendationTrends(normalizedSymbol);
      const recommendations = unwrapData<FinnhubRecommendation[]>(response);

      if (!Array.isArray(recommendations) || recommendations.length === 0) {
        throw new ProviderError(
          ProviderErrorCode.PROVIDER_ERROR,
          "No ratings data available",
          false,
        );
      }

      // Get the most recent recommendation
      const latest = recommendations[0];
      if (!latest) {
        throw new ProviderError(
          ProviderErrorCode.PROVIDER_ERROR,
          "No ratings data available",
          false,
        );
      }

      // Calculate consensus from buy/hold/sell counts
      const totalRatings =
        latest.strongBuy +
        latest.buy +
        latest.hold +
        latest.sell +
        latest.strongSell;
      const buyScore =
        (latest.strongBuy * 5 +
          latest.buy * 4 +
          latest.hold * 3 +
          latest.sell * 2 +
          latest.strongSell * 1) /
        totalRatings;

      let consensus: RatingData["consensus"];
      if (buyScore >= 4.5) consensus = "strong_buy";
      else if (buyScore >= 3.5) consensus = "buy";
      else if (buyScore >= 2.5) consensus = "hold";
      else if (buyScore >= 1.5) consensus = "sell";
      else consensus = "strong_sell";

      // Get price target from separate endpoint
      const priceTarget = await this.client.priceTarget(normalizedSymbol);
      const targetData = unwrapData<FinnhubPriceTarget>(priceTarget);

      const result: RatingData = {
        consensus,
        targetPrice: targetData?.targetMean ?? undefined,
        targetPriceHigh: targetData?.targetHigh ?? undefined,
        targetPriceLow: targetData?.targetLow ?? undefined,
        numberOfAnalysts: totalRatings,
      };

      // Validate the rating
      return validateData(
        RatingDataSchema,
        result,
        `Finnhub ratings for ${symbol}`,
      );
    } catch (error) {
      if (error instanceof Error && error.message.includes("429")) {
        throw new ProviderError(
          ProviderErrorCode.RATE_LIMIT_EXCEEDED,
          "Finnhub rate limit exceeded",
          true,
          60,
        );
      }
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

      // Convert dates to Unix timestamps (Finnhub expects seconds)
      const from = Math.floor(startDate.getTime() / 1000);
      const to = Math.floor(endDate.getTime() / 1000);

      // Finnhub stock candles endpoint
      const response = await this.client.stockCandles(
        normalizedSymbol,
        "D", // Daily resolution
        from,
        to,
      );

      const candles = unwrapData<FinnhubCandles>(response);

      // Check if data is available
      if (candles.s !== "ok" || !candles.t || candles.t.length === 0) {
        return []; // No historical data found
      }

      // Transform Finnhub candles to HistoricalPrice format (parallel arrays)
      const prices: HistoricalPrice[] = [];
      for (let i = 0; i < candles.t.length; i++) {
        const date = new Date(candles.t[i]! * 1000);
        prices.push({
          date: date.toISOString().split("T")[0]!,
          open: candles.o[i]!,
          high: candles.h[i]!,
          low: candles.l[i]!,
          close: candles.c[i]!,
          volume: candles.v[i]!,
        });
      }

      return prices;
    } catch (error) {
      if (error instanceof Error && error.message.includes("429")) {
        throw new ProviderError(
          ProviderErrorCode.RATE_LIMIT_EXCEEDED,
          "Finnhub rate limit exceeded",
          true,
          60,
        );
      }
      return this.handleHttpError(error, `fetchHistoricalPrices(${symbol})`);
    }
  }

  /**
   * Health check - verify Finnhub API is accessible
   */
  override async healthCheck(): Promise<boolean> {
    try {
      // Try to fetch a well-known symbol (Apple) as a health check
      await this.client.quote("AAPL");
      return true;
    } catch (error) {
      logger.error("[finnhub] Health check failed:", error);
      return false;
    }
  }
}
