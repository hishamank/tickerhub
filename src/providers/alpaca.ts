/**
 * Alpaca Markets Data Provider
 *
 * Implements the MarketDataProvider interface for Alpaca Markets API.
 * Requires API Key ID + Secret Key. Free tier: 10,000 calls/min (IEX data).
 *
 * Endpoints used:
 * - GET /v2/stocks/{symbol}/snapshot — Latest quote, trade, and daily bar
 * - GET /v2/stocks/{symbol}/bars — Historical OHLCV bars
 *
 * Free tier limitations:
 * - Data sourced from IEX exchange only (not consolidated NYSE/Nasdaq)
 * - US equities only — international symbols return 422
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

const logger = getLogger(
  "alpaca",
  "packages/provider-aggregator/src/providers/alpaca.ts",
);

interface AlpacaSnapshotResponse {
  latestTrade: { p: number; t: string };
  dailyBar: { o: number; h: number; l: number; c: number; v: number };
  prevDailyBar: { c: number };
}

interface AlpacaBar {
  t: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

interface AlpacaBarsResponse {
  bars: AlpacaBar[];
  next_page_token: string | null;
}

export class AlpacaProvider extends BaseProvider {
  readonly name = "alpaca";
  readonly supportedDataTypes: DataType[] = ["prices"];
  readonly rateLimit: RateLimitConfig = {
    requestsPerMinute: 200,
  };

  private apiKey: string;
  private apiSecret: string;
  private baseUrl = "https://data.alpaca.markets";

  constructor(credentials: Record<string, string> | null) {
    super();

    const apiKey = credentials?.api_key;
    const apiSecret = credentials?.api_secret;

    if (!apiKey) {
      throw new ConfigurationError("Alpaca API key ID is required");
    }

    if (!apiSecret) {
      throw new ConfigurationError("Alpaca API secret key is required");
    }

    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
  }

  /**
   * Fetch current stock quote via snapshot endpoint
   */
  async fetchQuote(symbol: string): Promise<QuoteData | null> {
    this.validateSymbol(symbol);

    try {
      const normalizedSymbol = symbol.toUpperCase();
      const url = `${this.baseUrl}/v2/stocks/${normalizedSymbol}/snapshot?feed=iex`;
      const response = await fetch(url, { headers: this.buildHeaders() });

      if (!response.ok) {
        if (response.status === 429) {
          throw new ProviderError(
            ProviderErrorCode.RATE_LIMIT_EXCEEDED,
            "Alpaca rate limit exceeded",
            true,
            60,
          );
        }

        if (response.status === 401) {
          throw new ProviderError(
            ProviderErrorCode.AUTHENTICATION_FAILED,
            "Alpaca authentication failed — check API key and secret",
            false,
          );
        }

        if (response.status === 403) {
          logger.warn(
            `[alpaca] 403 Forbidden for quote for ${normalizedSymbol}`,
          );
          return null;
        }

        if (response.status === 422) {
          throw new ProviderError(
            ProviderErrorCode.SYMBOL_NOT_FOUND,
            `Symbol ${normalizedSymbol} not found on Alpaca`,
            false,
          );
        }

        throw new ProviderError(
          ProviderErrorCode.NETWORK_ERROR,
          `Alpaca API returned ${response.status}`,
          true,
        );
      }

      const data = (await response.json()) as AlpacaSnapshotResponse;

      if (!data.latestTrade || !data.dailyBar) {
        return null;
      }

      const price = data.latestTrade.p;
      const previousClose = data.prevDailyBar?.c;
      const change =
        previousClose !== undefined ? price - previousClose : undefined;
      const changePercent =
        change !== undefined && previousClose
          ? (change / previousClose) * 100
          : undefined;

      const quoteData: QuoteData = {
        symbol: normalizedSymbol,
        price,
        open: data.dailyBar.o,
        high: data.dailyBar.h,
        low: data.dailyBar.l,
        previousClose,
        change,
        changePercent,
        volume: data.dailyBar.v,
        timestamp: new Date(data.latestTrade.t),
        currency: "USD",
      };

      return validateData(
        QuoteDataSchema,
        quoteData,
        `Alpaca quote for ${normalizedSymbol}`,
      );
    } catch (error) {
      if (error instanceof ProviderError) {
        throw error;
      }
      return this.handleHttpError(error, `fetchQuote(${symbol})`);
    }
  }

  /**
   * Fetch historical daily OHLCV bars
   */
  async fetchHistoricalPrices(
    symbol: string,
    startDate: Date,
    endDate: Date,
  ): Promise<HistoricalPrice[]> {
    this.validateSymbol(symbol);

    try {
      const normalizedSymbol = symbol.toUpperCase();
      const start = startDate.toISOString().split("T")[0];
      const end = endDate.toISOString().split("T")[0];

      const allBars: HistoricalPrice[] = [];
      let pageToken: string | null = null;

      do {
        const params = new URLSearchParams({
          timeframe: "1Day",
          start: start!,
          end: end!,
          limit: "10000",
          feed: "iex",
        });

        if (pageToken) {
          params.set("page_token", pageToken);
        }

        const url = `${this.baseUrl}/v2/stocks/${normalizedSymbol}/bars?${params.toString()}`;
        const response = await fetch(url, { headers: this.buildHeaders() });

        if (!response.ok) {
          if (response.status === 401) {
            throw new ProviderError(
              ProviderErrorCode.AUTHENTICATION_FAILED,
              "Alpaca authentication failed — check API key and secret",
              false,
            );
          }

          if (response.status === 403) {
            logger.warn(
              `[alpaca] 403 Forbidden for historical prices for ${normalizedSymbol}`,
            );
            return [];
          }

          if (response.status === 429) {
            throw new ProviderError(
              ProviderErrorCode.RATE_LIMIT_EXCEEDED,
              "Alpaca rate limit exceeded",
              true,
              60,
            );
          }

          if (response.status === 422) {
            return [];
          }

          throw new ProviderError(
            ProviderErrorCode.NETWORK_ERROR,
            `Alpaca API returned ${response.status}`,
            true,
          );
        }

        const data = (await response.json()) as AlpacaBarsResponse;

        if (data.bars && Array.isArray(data.bars)) {
          for (const bar of data.bars) {
            allBars.push({
              date: bar.t.split("T")[0]!,
              open: bar.o,
              high: bar.h,
              low: bar.l,
              close: bar.c,
              volume: bar.v,
            });
          }
        }

        pageToken = data.next_page_token;
      } while (pageToken);

      return allBars;
    } catch (error) {
      if (error instanceof ProviderError) {
        throw error;
      }
      return this.handleHttpError(error, `fetchHistoricalPrices(${symbol})`);
    }
  }

  /**
   * Health check — verify Alpaca API is accessible with current credentials
   */
  override async healthCheck(): Promise<boolean> {
    try {
      const url = `${this.baseUrl}/v2/stocks/AAPL/snapshot?feed=iex`;
      const response = await fetch(url, { headers: this.buildHeaders() });
      return response.ok;
    } catch (error) {
      logger.error("[alpaca] Health check failed:", error);
      return false;
    }
  }

  private buildHeaders(): Record<string, string> {
    return {
      "APCA-API-KEY-ID": this.apiKey,
      "APCA-API-SECRET-KEY": this.apiSecret,
      Accept: "application/json",
    };
  }

}
