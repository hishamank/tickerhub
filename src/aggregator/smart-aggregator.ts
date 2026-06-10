/**
 * Smart Aggregator — provider selection, fallback, credential resolution.
 *
 * Dependencies (registry, credential provider, rate-limit tracker, health
 * monitor, logger) are injected. The per-call execution concerns (circuit
 * breaker, health recording, rate-limit quotas) live in ProviderExecutor.
 */

import { getLogger } from "../logging/index.js";
import { isSupportedCryptoSymbol } from "../symbols/index.js";
import type {
  QuoteData,
  DividendData,
  EarningsData,
  EventData,
  RatingData,
  HistoricalPrice,
  OptionChain,
  MacroIndicatorData,
  MarketDataProvider,
  DataType,
} from "../types/index.js";
import type { Logger } from "../ports/logger.js";
import type { CredentialProvider } from "../ports/credential-provider.js";
import { ProviderFactory } from "../providers/provider-factory.js";
import { TradierProvider } from "../providers/tradier.js";
import { ProviderRegistry } from "../config/provider-registry.js";
import { HealthMonitor } from "../health/health-monitor.js";
import { RateLimitTracker } from "../rate-limiting/tracker.js";
import { ProviderExecutor } from "./provider-executor.js";
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
  private readonly credentials: CredentialProvider;
  private readonly logger: Logger;
  private readonly executor: ProviderExecutor;
  private registryReady: Promise<void> | null = null;

  constructor(deps: SmartAggregatorDeps) {
    this.registry = deps.registry;
    this.credentials = deps.credentials;
    this.logger = deps.logger ?? getLogger("smart-aggregator");
    this.executor = new ProviderExecutor(
      deps.healthMonitor ?? new HealthMonitor(),
      deps.rateLimitTracker ?? new RateLimitTracker(),
      this.logger,
    );
    this.registryReady = this.registry.load().then(() => {});
  }

  /** Wait for the registry to be loaded before querying providers. */
  private async ensureRegistry(): Promise<void> {
    if (this.registryReady) {
      await this.registryReady;
      this.registryReady = null;
    }
  }

  /**
   * Shared path for list-returning data types: try providers in priority order
   * with ADR fallback, treating an empty list as "no data".
   */
  private fetchList<T>(
    dataType: DataType,
    symbol: string,
    userId: string,
    pick: (provider: MarketDataProvider) => ((s: string) => Promise<T[]>) | undefined,
  ): Promise<T[]> {
    return executeWithAdrFallback<T[]>(
      symbol,
      userId,
      async (sym, uid) => (await this.tryProviders(dataType, sym, uid, pick)) ?? [],
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
        this.tryProviders("ratings", sym, uid, (provider) =>
          provider.fetchRatings
            ? (requestedSymbol: string) =>
                provider.fetchRatings!(requestedSymbol)
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
    return this.tryProviders("options", symbol, userId, (provider) =>
      provider.fetchOptionChain
        ? (requestedSymbol: string) =>
            provider.fetchOptionChain!(requestedSymbol, expirationDate)
        : undefined,
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
   * data type, in priority order with credential resolution and rate limiting.
   */
  async fetchMacroIndicator(
    indicator: string,
    userId: string = "system",
  ): Promise<MacroIndicatorData | null> {
    await this.ensureRegistry();

    for (const meta of this.registry.getProvidersForDataType("macro")) {
      const credentials = await this.credentials.resolve(meta.name, userId);
      if (!credentials && meta.requiresKey) continue;

      const provider = ProviderFactory.create(meta.name, credentials);
      if (!provider?.fetchMacroIndicator) continue;
      if (this.executor.isRateLimited(credentials, provider.name, meta)) {
        continue;
      }

      try {
        const result = await this.executor.execute(provider.name, () =>
          provider.fetchMacroIndicator!(indicator),
        );
        this.executor.recordRateLimit(credentials, provider.name, meta);
        if (result != null) return result;
      } catch (error) {
        this.logger.warn(`Failed to fetch macro from ${provider.name}:`, error);
      }
    }
    return null;
  }

  resetRateLimits(): void {
    this.executor.resetRateLimits();
  }

  /** Generic provider iteration — resolves credentials, checks rate limits, tries in priority. */
  private async tryProviders<T>(
    dataType: DataType,
    symbol: string,
    userId: string,
    getFetcher: (
      provider: MarketDataProvider,
    ) => ((symbol: string) => Promise<T>) | undefined,
  ): Promise<T | null> {
    await this.ensureRegistry();

    for (const meta of this.registry.getProvidersForDataType(dataType)) {
      const credentials = await this.credentials.resolve(meta.name, userId);
      if (!credentials && meta.requiresKey) continue;

      const provider =
        meta.name === "tradier"
          ? new TradierProvider(credentials)
          : ProviderFactory.create(meta.name, credentials);
      if (!provider) continue;

      const fetcher = getFetcher(provider);
      if (!fetcher) continue;
      if (this.executor.isRateLimited(credentials, provider.name, meta)) {
        continue;
      }

      try {
        const result = await this.executor.execute(provider.name, () =>
          fetcher(symbol),
        );
        this.executor.recordRateLimit(credentials, provider.name, meta);
        if (result != null) return result;
      } catch (error) {
        this.logger.warn(
          `Failed to fetch ${dataType} from ${provider.name}:`,
          error,
        );
      }
    }
    return null;
  }

  private async tryProvidersForQuote(
    symbol: string,
    userId: string,
  ): Promise<QuoteData | null> {
    await this.ensureRegistry();

    if (isSupportedCryptoSymbol(symbol)) {
      const provider = ProviderFactory.create("coingecko", null);
      if (provider) {
        try {
          const result = await this.executor.execute(provider.name, () =>
            provider.fetchQuote(symbol),
          );
          if (result != null) return result;
        } catch (error) {
          this.logger.warn(
            `Failed to fetch crypto quote from CoinGecko for ${symbol}:`,
            error,
          );
        }
      }
      return null;
    }

    return this.tryProviders(
      "prices",
      symbol,
      userId,
      (p) => (s: string) => p.fetchQuote(s),
    );
  }
}
