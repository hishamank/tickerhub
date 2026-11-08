import { Decimal } from "decimal.js";
import { ConfigurationError } from "../errors/index.js";
import { getLogger } from "../logging/index.js";
import { BaseProvider } from "./base-provider.js";
import { isEntitlementDenied } from "./provider-utils.js";
import { budgetedFetch } from "../resilience/request-budget.js";
import type {
  DataType,
  DividendData,
  EventData,
  HistoricalPrice,
  QuoteData,
  RateLimitConfig,
} from "../types/index.js";
import { ProviderError, ProviderErrorCode } from "../types/provider.js";
import {
  DividendDataSchema,
  EventDataSchema,
  HistoricalPriceSchema,
  QuoteDataSchema,
  validateData,
} from "../types/validation.js";

import type {
  PolygonDividendResult,
  PolygonHistoricalResponse,
  PolygonReferenceResponse,
  PolygonSnapshotResponse,
  PolygonSplitResult,
} from "./polygon-types.js";

const logger = getLogger(
  "polygon",
  "packages/provider-aggregator/src/providers/polygon.ts",
);

export class PolygonProvider extends BaseProvider {
  readonly name = "polygon";
  readonly supportedDataTypes: DataType[] = ["prices", "dividends", "events"];
  readonly rateLimit: RateLimitConfig = { requestsPerMinute: 5 };
  readonly meteredPerHttpRequest = true;
  private readonly apiKey: string;
  private readonly baseUrl = "https://api.polygon.io";

  constructor(credentials: Record<string, string> | null) {
    super();
    const apiKey = credentials?.api_key;
    if (!apiKey) {
      throw new ConfigurationError("Polygon API key is required");
    }
    this.apiKey = apiKey;
  }

  async fetchQuote(symbol: string): Promise<QuoteData | null> {
    this.validateSymbol(symbol);
    const normalizedSymbol = symbol.toUpperCase();
    let response: PolygonSnapshotResponse;
    try {
      response = await this.requestJson<PolygonSnapshotResponse>(
        `/v2/snapshot/locale/us/markets/stocks/tickers/${normalizedSymbol}`,
        `fetchQuote(${normalizedSymbol})`,
      );
    } catch (error) {
      if (isEntitlementDenied(error)) {
        return this.fetchPreviousDayQuote(normalizedSymbol);
      }
      throw error;
    }
    const ticker = response.ticker;
    const previousClose = ticker?.prevDay?.c;
    const price = ticker?.lastTrade?.p ?? ticker?.day?.c ?? previousClose;

    if (!ticker || price === undefined) {
      return null;
    }

    const change =
      previousClose !== undefined
        ? new Decimal(price).minus(previousClose).toNumber()
        : undefined;
    const changePercent =
      previousClose && previousClose !== 0
        ? new Decimal(change ?? 0).dividedBy(previousClose).times(100).toNumber()
        : ticker.todaysChangePerc;

    return validateData(QuoteDataSchema, {
      symbol: normalizedSymbol,
      price,
      open: ticker.day?.o,
      high: ticker.day?.h,
      low: ticker.day?.l,
      previousClose,
      change,
      changePercent,
      volume: this.toVolume(ticker.day?.v),
      timestamp: this.toDate(ticker.lastTrade?.t ?? ticker.updated),
      currency: "USD",
    }, `Polygon quote for ${normalizedSymbol}`);
  }

  /**
   * Plans without snapshot access can still read the previous session's bar.
   * This is end-of-day data: it keeps the bar's own date, is labelled as such,
   * and reports no change figures because the bar has no prior close.
   */
  private async fetchPreviousDayQuote(symbol: string): Promise<QuoteData | null> {
    const response = await this.requestJson<PolygonHistoricalResponse>(
      `/v2/aggs/ticker/${symbol}/prev?adjusted=true`,
      `fetchQuote.prev(${symbol})`,
    );
    const bar = response.results?.[0];
    if (!bar?.t || bar.c === undefined) return null;

    const timestamp = this.toDate(bar.t);
    return validateData(QuoteDataSchema, {
      symbol,
      price: bar.c,
      close: bar.c,
      open: bar.o,
      high: bar.h,
      low: bar.l,
      volume: this.toVolume(bar.v),
      timestamp,
      currency: "USD",
      priceBasis: "end_of_day",
      asOfDate: this.toIsoDate(timestamp),
      fallbackSource: "polygon:/v2/aggs/ticker/{ticker}/prev",
    }, `Polygon previous-day quote for ${symbol}`);
  }

  async fetchDividends(
    symbol: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<DividendData[]> {
    this.validateSymbol(symbol);
    const normalizedSymbol = symbol.toUpperCase();
    const params = new URLSearchParams({
      ticker: normalizedSymbol,
      order: "desc",
      sort: "ex_dividend_date",
      limit: "1000",
    });

    if (startDate) params.set("ex_dividend_date.gte", this.toIsoDate(startDate));
    if (endDate) params.set("ex_dividend_date.lte", this.toIsoDate(endDate));

    const response = await this.requestJson<PolygonReferenceResponse<PolygonDividendResult>>(
      `/v3/reference/dividends?${params.toString()}`,
      `fetchDividends(${normalizedSymbol})`,
    );

    return (response.results ?? [])
      .filter((item) => item.ex_dividend_date && item.cash_amount !== undefined)
      .map((item) => validateData(DividendDataSchema, {
        exDate: new Date(item.ex_dividend_date!),
        paymentDate: item.pay_date ? new Date(item.pay_date) : undefined,
        recordDate: item.record_date ? new Date(item.record_date) : undefined,
        declaredDate: item.declaration_date
          ? new Date(item.declaration_date)
          : undefined,
        amount: item.cash_amount,
        currency: item.currency ?? "USD",
        frequency: this.mapDividendFrequency(item.frequency),
      }, `Polygon dividend for ${normalizedSymbol}`));
  }

  async fetchEvents(symbol: string): Promise<EventData[]> {
    this.validateSymbol(symbol);
    const normalizedSymbol = symbol.toUpperCase();
    const params = new URLSearchParams({
      ticker: normalizedSymbol,
      order: "desc",
      sort: "execution_date",
      limit: "1000",
    });

    const response = await this.requestJson<PolygonReferenceResponse<PolygonSplitResult>>(
      `/v3/reference/splits?${params.toString()}`,
      `fetchEvents(${normalizedSymbol})`,
    );

    return (response.results ?? [])
      .filter((item) => item.execution_date && item.split_from && item.split_to)
      .map((item) => {
        const ratio = `${item.split_to}:${item.split_from}`;
        return validateData(EventDataSchema, {
          type: item.split_to! >= item.split_from! ? "split" : "reverse_split",
          date: new Date(item.execution_date!),
          description: `Stock split for ${normalizedSymbol}`,
          details: {
            ratio,
            ticker: item.ticker ?? normalizedSymbol,
          },
        }, `Polygon split for ${normalizedSymbol}`);
      });
  }

  async fetchHistoricalPrices(
    symbol: string,
    from: Date,
    to: Date,
  ): Promise<HistoricalPrice[]> {
    this.validateSymbol(symbol);
    const normalizedSymbol = symbol.toUpperCase();
    const path = `/v2/aggs/ticker/${normalizedSymbol}/range/1/day/${this.toIsoDate(from)}/${this.toIsoDate(to)}?adjusted=true&sort=asc&limit=50000`;
    const response = await this.requestJson<PolygonHistoricalResponse>(
      path,
      `fetchHistoricalPrices(${normalizedSymbol})`,
    );

    return (response.results ?? [])
      .filter((item) => item.c !== undefined)
      .map((item) => validateData(HistoricalPriceSchema, {
        date: this.toIsoDate(this.toDate(item.t)),
        close: item.c,
        volume: this.toVolume(item.v),
        open: item.o,
        high: item.h,
        low: item.l,
      }, `Polygon historical price for ${normalizedSymbol}`));
  }

  private async requestJson<T>(path: string, context: string): Promise<T> {
    const url = new URL(path, this.baseUrl);
    url.searchParams.append("apiKey", this.apiKey);
    try {
      const response = await budgetedFetch(url);

      if (!response.ok) {
        throw this.mapHttpError(response.status);
      }

      try {
        return await response.json() as T;
      } catch (error) {
        logger.error("[polygon] Failed to parse response", { context });
        return this.handleHttpError(error, context);
      }
    } catch (error) {
      return this.handleHttpError(error, context);
    }
  }

  /** Polygon can report fractional share volume; the domain uses whole shares. */
  private toVolume(volume?: number): number | undefined {
    return volume === undefined ? undefined : Math.round(volume);
  }

  private toIsoDate(date: Date): string {
    return date.toISOString().split("T")[0]!;
  }

  private toDate(timestamp?: number): Date {
    if (!timestamp) {
      return new Date();
    }

    const millis =
      timestamp > 10_000_000_000_000
        ? Math.floor(timestamp / 1_000_000)
        : timestamp;
    return new Date(millis);
  }

  private mapDividendFrequency(
    frequency?: number,
  ): DividendData["frequency"] | undefined {
    if (frequency === 12) return "monthly";
    if (frequency === 4) return "quarterly";
    if (frequency === 2) return "semi_annual";
    if (frequency === 1) return "annual";
    return undefined;
  }

  private mapHttpError(status: number): ProviderError {
    if (status === 400) {
      return new ProviderError(
        ProviderErrorCode.INVALID_REQUEST,
        "Polygon request was invalid",
        false,
      );
    }
    if (status === 401) {
      return new ProviderError(
        ProviderErrorCode.AUTHENTICATION_FAILED,
        "Polygon authentication failed - check API key",
        false,
      );
    }
    if (status === 403) {
      return new ProviderError(
        ProviderErrorCode.ENTITLEMENT_REQUIRED,
        "Polygon plan does not include this data (HTTP 403)",
        false,
      );
    }

    if (status === 404) {
      return new ProviderError(
        ProviderErrorCode.SYMBOL_NOT_FOUND,
        "Polygon symbol not found",
        false,
      );
    }

    if (status === 429) {
      return new ProviderError(
        ProviderErrorCode.RATE_LIMIT_EXCEEDED,
        "Polygon rate limit exceeded",
        true,
        60,
      );
    }

    return new ProviderError(
      ProviderErrorCode.PROVIDER_ERROR,
      `Polygon API returned ${status}`,
      status >= 500,
    );
  }
}
