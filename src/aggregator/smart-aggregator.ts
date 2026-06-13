/**
 * Smart Aggregator — per-data-type wiring over the shared query engine.
 *
 * Dependencies (registry, credential provider, rate-limit tracker, health
 * monitor, logger) are injected. The generic selection/fallback loop lives in
 * ProviderQueryEngine; the per-call execution concerns (circuit breaker, health
 * recording, rate-limit quotas) live in ProviderExecutor.
 */

import { getLogger } from "../logging/index.js";
import type {
  QuoteData,
  DividendData,
  EarningsData,
  EventData,
  RatingData,
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
  MarketDataProvider,
  DataType,
} from "../types/index.js";
import type { Logger } from "../ports/logger.js";
import type { CredentialProvider } from "../ports/credential-provider.js";
import { ProviderRegistry } from "../config/provider-registry.js";
import { HealthMonitor } from "../health/health-monitor.js";
import { RateLimitTracker } from "../rate-limiting/tracker.js";
import { ProviderExecutor } from "./provider-executor.js";
import { ProviderQueryEngine } from "./provider-query-engine.js";
import { CryptoAggregator } from "./crypto-aggregator.js";
import { ForexAggregator } from "./forex-aggregator.js";
import {
  enrichWithCurrencyInfo,
  executeWithAdrFallback,
} from "./adr-fallback.js";

export interface SmartAggregatorDeps {
  registry: ProviderRegistry;
  credentials: CredentialProvider;
  logger?: Logger;
  rateLimitTracker?: RateLimitTracker;
  healthMonitor?: HealthMonitor;
}

export class SmartAggregator {
  private readonly registry: ProviderRegistry;
  private readonly logger: Logger;
  private readonly executor: ProviderExecutor;
  private readonly engine: ProviderQueryEngine;

  /** Crypto asset-class namespace (shares the query engine). */
  readonly crypto: CryptoAggregator;
  /** Forex asset-class namespace (shares the query engine). */
  readonly forex: ForexAggregator;

  constructor(deps: SmartAggregatorDeps) {
    this.registry = deps.registry;
    this.logger = deps.logger ?? getLogger("smart-aggregator");
    this.executor = new ProviderExecutor(
      deps.healthMonitor ?? new HealthMonitor(),
      deps.rateLimitTracker ?? new RateLimitTracker(),
      this.logger,
    );
    this.engine = new ProviderQueryEngine(
      this.registry,
      deps.credentials,
      this.executor,
      this.logger,
    );
    this.crypto = new CryptoAggregator(this.engine);
    this.forex = new ForexAggregator(this.engine);
  }

  /**
   * Shared path for list-returning data types: try providers in priority order
   * with ADR fallback, treating an empty list as "no data".
   */
  private fetchList<T>(
    dataType: DataType,
    symbol: string,
    userId: string,
    pick: (
      provider: MarketDataProvider,
    ) => ((s: string) => Promise<T[]>) | undefined,
  ): Promise<T[]> {
    return executeWithAdrFallback<T[]>(
      symbol,
      userId,
      async (sym, uid) => (await this.engine.tryProviders(dataType, sym, uid, pick)) ?? [],
      (result) => result.length === 0,
      [],
    );
  }

  async fetchQuote(
    symbol: string,
    userId: string = "system",
  ): Promise<QuoteData | null> {
    const quote = await executeWithAdrFallback<QuoteData | null>(
      symbol,
      userId,
      (sym, uid) => this.tryProvidersForQuote(sym, uid),
      (result) => result === null,
      null,
    );
    if (!quote) return null;
    return enrichWithCurrencyInfo(quote, symbol);
  }

  async fetchDividends(
    symbol: string,
    userId: string = "system",
    limit?: number,
  ): Promise<DividendData[]> {
    const dividends = await this.fetchList<DividendData>(
      "dividends",
      symbol,
      userId,
      (p) => (p.fetchDividends ? (s) => p.fetchDividends!(s) : undefined),
    );
    return limit ? dividends.slice(0, limit) : dividends;
  }

  async fetchEarnings(
    symbol: string,
    userId: string = "system",
  ): Promise<EarningsData[]> {
    return this.fetchList<EarningsData>("earnings", symbol, userId, (p) =>
      p.fetchEarnings ? (s) => p.fetchEarnings!(s) : undefined,
    );
  }

  async fetchRatings(
    symbol: string,
    userId: string = "system",
  ): Promise<RatingData | null> {
    return executeWithAdrFallback<RatingData | null>(
      symbol,
      userId,
      (sym, uid) =>
        this.engine.tryProviders("ratings", sym, uid, (provider) =>
          provider.fetchRatings
            ? (requestedSymbol: string) => provider.fetchRatings!(requestedSymbol)
            : undefined,
        ),
      (result) => result === null,
      null,
    );
  }

  async fetchEvents(
    symbol: string,
    userId: string = "system",
  ): Promise<EventData[]> {
    return this.fetchList<EventData>("events", symbol, userId, (p) =>
      p.fetchEvents ? (s) => p.fetchEvents!(s) : undefined,
    );
  }

  async fetchHistoricalPrices(
    symbol: string,
    userId: string = "system",
    from: Date,
    to: Date,
  ): Promise<HistoricalPrice[]> {
    return this.fetchList<HistoricalPrice>("prices", symbol, userId, (p) =>
      p.fetchHistoricalPrices
        ? (s) => p.fetchHistoricalPrices!(s, from, to)
        : undefined,
    );
  }

  async fetchOptionChain(
    symbol: string,
    userId: string = "system",
    expirationDate: Date,
  ): Promise<OptionChain | null> {
    return this.engine.tryProviders("options", symbol, userId, (provider) =>
      provider.fetchOptionChain
        ? (requestedSymbol: string) =>
            provider.fetchOptionChain!(requestedSymbol, expirationDate)
        : undefined,
    );
  }

  async fetchProfile(
    symbol: string,
    userId: string = "system",
  ): Promise<CompanyProfile | null> {
    return executeWithAdrFallback<CompanyProfile | null>(
      symbol,
      userId,
      (sym, uid) =>
        this.engine.tryProviders("profile", sym, uid, (provider) =>
          provider.fetchProfile
            ? (requestedSymbol: string) => provider.fetchProfile!(requestedSymbol)
            : undefined,
        ),
      (result) => result === null,
      null,
    );
  }

  fetchNews(symbol: string, userId: string = "system"): Promise<NewsArticle[]> {
    return this.engine.tryProvidersList<NewsArticle>("news", symbol, userId, (p) =>
      p.fetchNews ? (s) => p.fetchNews!(s) : undefined,
    );
  }

  fetchIpoCalendar(userId: string = "system"): Promise<IpoEvent[]> {
    return this.engine.tryProvidersList<IpoEvent>("ipo", "", userId, (p) =>
      p.fetchIpoCalendar ? () => p.fetchIpoCalendar!() : undefined,
    );
  }

  searchSymbols(
    query: string,
    userId: string = "system",
  ): Promise<SymbolSearchResult[]> {
    return this.engine.tryProvidersList<SymbolSearchResult>(
      "search",
      query,
      userId,
      (p) => (p.searchSymbols ? (q) => p.searchSymbols!(q) : undefined),
    );
  }

  fetchInsiderTransactions(
    symbol: string,
    userId: string = "system",
  ): Promise<InsiderTransaction[]> {
    return this.engine.tryProvidersList<InsiderTransaction>(
      "insider",
      symbol,
      userId,
      (p) =>
        p.fetchInsiderTransactions
          ? (s) => p.fetchInsiderTransactions!(s)
          : undefined,
    );
  }

  fetchTechnicalIndicator(
    symbol: string,
    indicator: string,
    userId: string = "system",
    interval?: string,
  ): Promise<TechnicalIndicator | null> {
    return this.engine.tryProviders<TechnicalIndicator | null>(
      "technicals",
      symbol,
      userId,
      (p) =>
        p.fetchTechnicalIndicator
          ? (s) => p.fetchTechnicalIndicator!(s, indicator, interval)
          : undefined,
    );
  }

  fetchMarketMovers(
    direction: "gainers" | "losers" | "actives",
    userId: string = "system",
  ): Promise<MarketMover[]> {
    return this.engine.tryProvidersList<MarketMover>(
      "movers",
      direction,
      userId,
      (p) => (p.fetchMarketMovers ? () => p.fetchMarketMovers!(direction) : undefined),
    );
  }

  getProviderHealth(providerId: string) {
    return this.executor.getProviderHealth(providerId);
  }

  async getRegisteredProviders(): Promise<string[]> {
    return this.registry.getEnabledProviders();
  }

  /**
   * Fetch macroeconomic indicator data from providers supporting the macro
   * data type, in priority order. The indicator code is passed through the
   * generic engine in place of a symbol.
   */
  async fetchMacroIndicator(
    indicator: string,
    userId: string = "system",
  ): Promise<MacroIndicatorData | null> {
    return this.engine.tryProviders("macro", indicator, userId, (provider) =>
      provider.fetchMacroIndicator
        ? (code: string) => provider.fetchMacroIndicator!(code)
        : undefined,
    );
  }

  resetRateLimits(): void {
    this.executor.resetRateLimits();
  }

  private tryProvidersForQuote(
    symbol: string,
    userId: string,
  ): Promise<QuoteData | null> {
    // Equity quotes only — crypto routes through `service.crypto.getQuote`.
    return this.engine.tryProviders(
      "prices",
      symbol,
      userId,
      (p) => (s: string) => p.fetchQuote(s),
    );
  }
}
