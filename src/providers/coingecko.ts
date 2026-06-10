/**
 * CoinGecko Provider
 *
 * Free cryptocurrency price data provider.
 * No API key required for basic tier (rate-limited to ~30 calls/min).
 *
 * API: https://www.coingecko.com/en/api/documentation
 */

import { getLogger } from "../logging/index.js";
import { Decimal } from "decimal.js";
import type { RateLimitConfig, DataType, QuoteData } from "../types/index.js";
import { ProviderError, ProviderErrorCode } from "../types/provider.js";
import { BaseProvider } from "./base-provider.js";
import { getCoinGeckoId } from "../symbols/index.js";

const logger = getLogger("coingecko-provider", "packages/provider-aggregator");

const COINGECKO_BASE_URL = "https://api.coingecko.com/api/v3";
const RATE_LIMIT_DELAY_MS = 2000; // 2 seconds between calls to stay under 30/min

interface CoinGeckoPriceResponse {
  [coinId: string]: {
    usd: number;
    usd_24h_change?: number;
  };
}

export interface CoinGeckoProviderConfig {
  maxRetries?: number;
  retryBackoffMs?: number;
  rateLimitDelayMs?: number;
}

export class CoinGeckoProvider extends BaseProvider {
  readonly name = "coingecko";
  readonly supportedDataTypes: DataType[] = ["prices"];
  readonly rateLimit: RateLimitConfig = {
    requestsPerMinute: 30,
    requestsPerHour: null,
    requestsPerDay: null,
    burstLimit: null,
    monthlyLimit: null,
  };

  private readonly config: Required<CoinGeckoProviderConfig>;
  private apiKey: string | null = null;
  private lastCallTime = 0;

  constructor(
    credentials: Record<string, string> | null = null,
    config: CoinGeckoProviderConfig = {},
  ) {
    super();
    this.apiKey = credentials?.api_key ?? null;
    this.config = {
      maxRetries: config.maxRetries ?? 3,
      retryBackoffMs: config.retryBackoffMs ?? 1000,
      rateLimitDelayMs: config.rateLimitDelayMs ?? RATE_LIMIT_DELAY_MS,
    };
  }

  /**
   * Apply rate limit delay before making API call
   */
  private async applyRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastCall = now - this.lastCallTime;

    if (timeSinceLastCall < this.config.rateLimitDelayMs) {
      const delay = this.config.rateLimitDelayMs - timeSinceLastCall;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    this.lastCallTime = Date.now();
  }

  /**
   * Fetch current crypto price from CoinGecko
   * @param symbol - Crypto symbol (e.g., 'BTC', 'ETH', 'SOL')
   * @returns Quote data
   * @throws {ProviderError} If symbol is not supported or API error occurs
   */
  async fetchQuote(symbol: string): Promise<QuoteData> {
    const coingeckoId = getCoinGeckoId(symbol);

    if (!coingeckoId) {
      throw new ProviderError(
        ProviderErrorCode.SYMBOL_NOT_FOUND,
        `Crypto symbol ${symbol} not supported by CoinGecko`,
        false,
      );
    }

    try {
      await this.applyRateLimit();

      const url = `${COINGECKO_BASE_URL}/simple/price?ids=${coingeckoId}&vs_currencies=usd&include_24hr_change=true`;

      const response = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        if (response.status === 429) {
          throw new ProviderError(
            ProviderErrorCode.RATE_LIMIT_EXCEEDED,
            "CoinGecko rate limit exceeded",
            true,
            60,
          );
        }

        throw new ProviderError(
          ProviderErrorCode.PROVIDER_ERROR,
          `CoinGecko API error: ${response.status} ${response.statusText}`,
          true,
        );
      }

      const data = (await response.json()) as CoinGeckoPriceResponse;
      const priceData = data[coingeckoId];

      if (!priceData) {
        logger.warn(`[coingecko] No price data for ${coingeckoId}`);
        throw new ProviderError(
          ProviderErrorCode.PROVIDER_ERROR,
          `No price data available for ${coingeckoId}`,
          true,
        );
      }

      const price = new Decimal(priceData.usd);
      // Clamp change24h to max -99.9% to prevent division by zero or negative previousClose
      const change24h = Math.max(priceData.usd_24h_change ?? 0, -99.9);

      // Calculate approximate high/low from 24h change
      const previousClose = price.div(
        new Decimal(1).plus(new Decimal(change24h).div(100)),
      );
      const high = price.gt(previousClose) ? price : previousClose;
      const low = price.lt(previousClose) ? price : previousClose;

      const quote: QuoteData = {
        symbol: symbol.toUpperCase(),
        price: price.toNumber(),
        open: previousClose.toNumber(),
        high: high.toNumber(),
        low: low.toNumber(),
        close: previousClose.toNumber(),
        previousClose: previousClose.toNumber(),
        change: price.sub(previousClose).toNumber(),
        changePercent: change24h,
        volume: 0, // CoinGecko free tier doesn't include volume in simple price
        currency: "USD",
        timestamp: new Date(),
      };

      logger.debug(
        `[coingecko] Fetched price for ${symbol}: $${price.toFixed(2)}`,
      );
      return quote;
    } catch (error) {
      if (error instanceof ProviderError) {
        throw error;
      }

      logger.error(`[coingecko] Failed to fetch price for ${symbol}:`, error);
      throw new ProviderError(
        ProviderErrorCode.NETWORK_ERROR,
        `Network error: ${error instanceof Error ? error.message : String(error)}`,
        true,
      );
    }
  }

  /**
   * Fetch prices for multiple cryptocurrencies in a single call
   * @param symbols - Array of crypto symbols
   * @returns Map of symbol to quote data
   */
  async fetchBatchQuotes(symbols: string[]): Promise<Map<string, QuoteData>> {
    const coingeckoIds = symbols
      .map((symbol) => ({
        symbol: symbol.toUpperCase(),
        id: getCoinGeckoId(symbol),
      }))
      .filter(
        (item): item is { symbol: string; id: string } => item.id !== null,
      );

    if (coingeckoIds.length === 0) {
      return new Map();
    }

    try {
      await this.applyRateLimit();

      const ids = coingeckoIds.map((item) => item.id).join(",");
      const url = `${COINGECKO_BASE_URL}/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`;

      const response = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        throw new ProviderError(
          ProviderErrorCode.PROVIDER_ERROR,
          `CoinGecko API error: ${response.status} ${response.statusText}`,
          true,
        );
      }

      const data = (await response.json()) as CoinGeckoPriceResponse;
      const results = new Map<string, QuoteData>();

      for (const { symbol, id } of coingeckoIds) {
        const priceData = data[id];
        if (!priceData) continue;

        const price = new Decimal(priceData.usd);
        // Clamp change24h to max -99.9% to prevent division by zero or negative previousClose
        const change24h = Math.max(priceData.usd_24h_change ?? 0, -99.9);
        const previousClose = price.div(
          new Decimal(1).plus(new Decimal(change24h).div(100)),
        );
        const high = price.gt(previousClose) ? price : previousClose;
        const low = price.lt(previousClose) ? price : previousClose;

        results.set(symbol, {
          symbol,
          price: price.toNumber(),
          open: previousClose.toNumber(),
          high: high.toNumber(),
          low: low.toNumber(),
          close: previousClose.toNumber(),
          previousClose: previousClose.toNumber(),
          change: price.sub(previousClose).toNumber(),
          changePercent: change24h,
          volume: 0,
          currency: "USD",
          timestamp: new Date(),
        });
      }

      logger.debug(
        `[coingecko] Fetched batch prices for ${results.size} symbols`,
      );
      return results;
    } catch (error) {
      logger.error("[coingecko] Batch quote fetch failed:", error);
      throw new ProviderError(
        ProviderErrorCode.NETWORK_ERROR,
        `Network error: ${error instanceof Error ? error.message : String(error)}`,
        true,
      );
    }
  }

  /**
   * Health check - verify CoinGecko API is accessible
   */
  override async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${COINGECKO_BASE_URL}/ping`, {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

export const coingeckoProvider = new CoinGeckoProvider();
