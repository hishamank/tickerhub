/**
 * Provider Aggregator Service
 *
 * Main service with SWR-cached methods for fetching market data. All methods
 * use SWR caching with auto-generated cache keys. The aggregator and SWR cache
 * are injected (see `createAggregator`).
 */

import type { SwrCache } from "../cache/swr-cache.js";
import type { SmartAggregator } from "../aggregator/smart-aggregator.js";
import type {
  QuoteData,
  DividendData,
  EarningsData,
  RatingData,
  EventData,
  HistoricalPrice,
  OptionChain,
  MacroIndicatorData,
  MarketDataResponse,
} from "../types/index.js";

export class ProviderAggregatorService {
  constructor(
    private readonly aggregator: SmartAggregator,
    private readonly cache: SwrCache,
  ) {}

  /** Get quote for a symbol (SWR-cached). */
  async getQuote(
    symbol: string,
    userId: string = "system",
    options?: { forceRefresh?: boolean },
  ): Promise<MarketDataResponse<QuoteData | null>> {
    return this.cache.get(
      "getQuote",
      [symbol.toUpperCase()],
      () => this.aggregator.fetchQuote(symbol, userId),
      options,
    );
  }

  /** Get quotes for multiple symbols (SWR-cached per symbol). */
  async getBatchQuotes(
    symbols: string[],
    userId: string = "system",
    options?: { forceRefresh?: boolean },
  ): Promise<Map<string, MarketDataResponse<QuoteData>>> {
    const results = new Map<string, MarketDataResponse<QuoteData>>();

    await Promise.all(
      symbols.map(async (symbol) => {
        const response = await this.getQuote(symbol, userId, options);
        if (response.data) {
          results.set(
            symbol.toUpperCase(),
            response as MarketDataResponse<QuoteData>,
          );
        }
      }),
    );

    return results;
  }

  /** Get dividends for a symbol (SWR-cached). */
  async getDividends(
    symbol: string,
    userId: string = "system",
    options?: { limit?: number; forceRefresh?: boolean },
  ): Promise<MarketDataResponse<DividendData[]>> {
    const { limit = 20, forceRefresh } = options || {};

    return this.cache.get(
      "getDividends",
      [symbol.toUpperCase(), { limit }],
      () => this.aggregator.fetchDividends(symbol, userId, limit),
      forceRefresh !== undefined ? { forceRefresh } : undefined,
    );
  }

  /** Get earnings for a symbol (SWR-cached). */
  async getEarnings(
    symbol: string,
    userId: string = "system",
    options?: { forceRefresh?: boolean },
  ): Promise<MarketDataResponse<EarningsData[]>> {
    return this.cache.get(
      "getEarnings",
      [symbol.toUpperCase()],
      () => this.aggregator.fetchEarnings(symbol, userId),
      options,
    );
  }

  /** Get analyst ratings for a symbol (SWR-cached). */
  async getRatings(
    symbol: string,
    userId: string = "system",
    options?: { forceRefresh?: boolean },
  ): Promise<MarketDataResponse<RatingData | null>> {
    return this.cache.get(
      "getRatings",
      [symbol.toUpperCase()],
      () => this.aggregator.fetchRatings(symbol, userId),
      options,
    );
  }

  /** Get corporate events for a symbol (SWR-cached). */
  async getEvents(
    symbol: string,
    userId: string = "system",
    options?: { forceRefresh?: boolean },
  ): Promise<MarketDataResponse<EventData[]>> {
    return this.cache.get(
      "getEvents",
      [symbol.toUpperCase()],
      () => this.aggregator.fetchEvents(symbol, userId),
      options,
    );
  }

  /** Get historical prices (SWR-cached). */
  async getHistoricalPrices(
    symbol: string,
    userId: string = "system",
    from: Date,
    to: Date,
    options?: { forceRefresh?: boolean },
  ): Promise<MarketDataResponse<HistoricalPrice[]>> {
    return this.cache.get(
      "getHistoricalPrices",
      [
        symbol.toUpperCase(),
        from.toISOString().split("T")[0],
        to.toISOString().split("T")[0],
      ],
      () => this.aggregator.fetchHistoricalPrices(symbol, userId, from, to),
      options,
    );
  }

  /** Get macroeconomic indicator data (SWR-cached). */
  async getMacroIndicator(
    indicator: string,
    userId: string = "system",
    options?: { forceRefresh?: boolean },
  ): Promise<MarketDataResponse<MacroIndicatorData | null>> {
    return this.cache.get(
      "getMacroIndicator",
      [indicator.toUpperCase()],
      () => this.aggregator.fetchMacroIndicator(indicator, userId),
      options,
    );
  }

  /** Get option chain for an underlying and expiration date (SWR-cached). */
  async getOptionChain(
    symbol: string,
    expirationDate: Date,
    userId: string = "system",
    options?: { forceRefresh?: boolean },
  ): Promise<MarketDataResponse<OptionChain | null>> {
    return this.cache.get(
      "getOptionChain",
      [symbol.toUpperCase(), expirationDate.toISOString().split("T")[0]],
      () => this.aggregator.fetchOptionChain(symbol, userId, expirationDate),
      options,
    );
  }

  /** Invalidate all cache for a symbol. */
  async invalidateSymbol(symbol: string): Promise<void> {
    await this.cache.invalidateSymbol(symbol);
  }

  /** Invalidate cache for a specific operation. */
  async invalidateOperation(operation: string, symbol?: string): Promise<void> {
    const pattern = symbol ? `${operation}:${symbol.toUpperCase()}` : operation;
    await this.cache.invalidate(pattern);
  }

  /** Get provider health status. */
  getProviderHealth(providerId: string): {
    status: "enabled" | "degraded" | "disabled";
    successRate: number;
    avgLatency: number;
  } {
    return this.aggregator.getProviderHealth(providerId);
  }

  /** Get all registered providers. */
  async getRegisteredProviders(): Promise<string[]> {
    return this.aggregator.getRegisteredProviders();
  }

  /** Reset rate limits (call at the start of a worker run). */
  resetRateLimits(): void {
    this.aggregator.resetRateLimits();
  }
}
