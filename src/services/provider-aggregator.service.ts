/**
 * Provider Aggregator Service
 *
 * Main service with SWR-cached methods for fetching market data. All methods
 * use SWR caching with auto-generated cache keys. The aggregator and SWR cache
 * are injected (see `createAggregator`).
 */

import type { SwrCache } from "../cache/swr-cache.js";
import type { SmartAggregator } from "../aggregator/smart-aggregator.js";
import { CryptoService } from "./crypto.service.js";
import { ForexService } from "./forex.service.js";
import type {
  QuoteData,
  DividendData,
  EarningsData,
  RatingData,
  EventData,
  HistoricalPrice,
  OptionChain,
  CompanyProfile,
  NewsArticle,
  IpoEvent,
  SymbolSearchResult,
  InsiderTransaction,
  TechnicalIndicator,
  MarketMover,
  MacroIndicatorData,
  MarketDataResponse,
} from "../types/index.js";

export class ProviderAggregatorService {
  /** Crypto asset-class namespace (`service.crypto.*`). */
  readonly crypto: CryptoService;
  /** Forex asset-class namespace (`service.forex.*`). */
  readonly forex: ForexService;

  constructor(
    private readonly aggregator: SmartAggregator,
    private readonly cache: SwrCache,
  ) {
    this.crypto = new CryptoService(aggregator.crypto, cache);
    this.forex = new ForexService(aggregator.forex, cache);
  }

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

  /** Get company profile / fundamentals (SWR-cached). */
  async getCompanyProfile(
    symbol: string,
    userId: string = "system",
    options?: { forceRefresh?: boolean },
  ): Promise<MarketDataResponse<CompanyProfile | null>> {
    return this.cache.get(
      "getCompanyProfile",
      [symbol.toUpperCase()],
      () => this.aggregator.fetchProfile(symbol, userId),
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

  /** Get recent company news (SWR-cached). */
  async getNews(
    symbol: string,
    userId: string = "system",
    options?: { forceRefresh?: boolean },
  ): Promise<MarketDataResponse<NewsArticle[]>> {
    return this.cache.get(
      "getNews",
      [symbol.toUpperCase()],
      () => this.aggregator.fetchNews(symbol, userId),
      options,
    );
  }

  /** Get the IPO calendar (SWR-cached). */
  async getIpoCalendar(
    userId: string = "system",
    options?: { forceRefresh?: boolean },
  ): Promise<MarketDataResponse<IpoEvent[]>> {
    return this.cache.get(
      "getIpoCalendar",
      ["ALL"],
      () => this.aggregator.fetchIpoCalendar(userId),
      options,
    );
  }

  /** Search for matching symbols (SWR-cached). */
  async searchSymbols(
    query: string,
    userId: string = "system",
    options?: { forceRefresh?: boolean },
  ): Promise<MarketDataResponse<SymbolSearchResult[]>> {
    return this.cache.get(
      "searchSymbols",
      [query.toLowerCase()],
      () => this.aggregator.searchSymbols(query, userId),
      options,
    );
  }

  /** Get insider transactions for a symbol (SWR-cached). */
  async getInsiderTransactions(
    symbol: string,
    userId: string = "system",
    options?: { forceRefresh?: boolean },
  ): Promise<MarketDataResponse<InsiderTransaction[]>> {
    return this.cache.get(
      "getInsiderTransactions",
      [symbol.toUpperCase()],
      () => this.aggregator.fetchInsiderTransactions(symbol, userId),
      options,
    );
  }

  /** Get a technical-indicator series for a symbol (SWR-cached). */
  async getTechnicalIndicator(
    symbol: string,
    indicator: string,
    userId: string = "system",
    options?: { interval?: string; forceRefresh?: boolean },
  ): Promise<MarketDataResponse<TechnicalIndicator | null>> {
    const interval = options?.interval ?? "daily";
    return this.cache.get(
      "getTechnicalIndicator",
      [symbol.toUpperCase(), indicator.toLowerCase(), interval],
      () =>
        this.aggregator.fetchTechnicalIndicator(
          symbol,
          indicator,
          userId,
          interval,
        ),
      options,
    );
  }

  /** Get market movers — gainers/losers/most-active (SWR-cached). */
  async getMarketMovers(
    direction: "gainers" | "losers" | "actives",
    userId: string = "system",
    options?: { forceRefresh?: boolean },
  ): Promise<MarketDataResponse<MarketMover[]>> {
    return this.cache.get(
      "getMarketMovers",
      [direction],
      () => this.aggregator.fetchMarketMovers(direction, userId),
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
