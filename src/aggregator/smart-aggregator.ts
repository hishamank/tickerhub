/**
 * Smart Aggregator — provider selection, fallback, credential resolution.
 *
 * Dependencies (registry, credential provider, rate-limit tracker, logger) are
 * injected, so the aggregator is decoupled from any specific persistence or
 * credential backend.
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
import { CircuitBreaker } from "../resilience/index.js";
import { ProviderError, ProviderErrorCode } from "../types/provider.js";
import { ProviderFactory } from "../providers/provider-factory.js";
import { TradierProvider } from "../providers/tradier.js";
import {
  ProviderRegistry,
  type ProviderMetadata,
} from "../config/provider-registry.js";
import { HealthMonitor } from "../health/health-monitor.js";
import { RateLimitTracker } from "../rate-limiting/tracker.js";
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
  private readonly rateLimitTracker: RateLimitTracker;
  private readonly healthMonitor: HealthMonitor;
  private registryReady: Promise<void> | null = null;
  /** One circuit breaker per provider, applied uniformly to every call. */
  private readonly circuitBreakers = new Map<string, CircuitBreaker>();

  constructor(deps: SmartAggregatorDeps) {
    this.registry = deps.registry;
    this.credentials = deps.credentials;
    this.logger = deps.logger ?? getLogger("smart-aggregator");
    this.rateLimitTracker = deps.rateLimitTracker ?? new RateLimitTracker();
    this.healthMonitor = deps.healthMonitor ?? new HealthMonitor();
    this.registryReady = this.registry.load().then(() => {});
  }

  /** Wait for the registry to be loaded before querying providers. */
  private async ensureRegistry(): Promise<void> {
    if (this.registryReady) {
      await this.registryReady;
      this.registryReady = null;
    }
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
    const dividends = await executeWithAdrFallback<DividendData[]>(
      symbol,
      userId,
      async (sym, uid) =>
        (await this.tryProviders("dividends", sym, uid, (provider) =>
          provider.fetchDividends
            ? (requestedSymbol: string) =>
                provider.fetchDividends!(requestedSymbol)
            : undefined,
        )) ?? [],
      (result) => result.length === 0,
      [],
    );
    return limit ? dividends.slice(0, limit) : dividends;
  }

  async fetchEarnings(
    symbol: string,
    userId: string = "system",
  ): Promise<EarningsData[]> {
    return executeWithAdrFallback<EarningsData[]>(
      symbol,
      userId,
      async (sym, uid) =>
        (await this.tryProviders("earnings", sym, uid, (provider) =>
          provider.fetchEarnings
            ? (requestedSymbol: string) =>
                provider.fetchEarnings!(requestedSymbol)
            : undefined,
        )) ?? [],
      (result) => result.length === 0,
      [],
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
    return executeWithAdrFallback<EventData[]>(
      symbol,
      userId,
      async (sym, uid) =>
        (await this.tryProviders("events", sym, uid, (provider) =>
          provider.fetchEvents
            ? (requestedSymbol: string) =>
                provider.fetchEvents!(requestedSymbol)
            : undefined,
        )) ?? [],
      (result) => result.length === 0,
      [],
    );
  }

  async fetchHistoricalPrices(
    symbol: string,
    userId: string = "system",
    from: Date,
    to: Date,
  ): Promise<HistoricalPrice[]> {
    return executeWithAdrFallback<HistoricalPrice[]>(
      symbol,
      userId,
      async (sym, uid) =>
        (await this.tryProviders("prices", sym, uid, (p) =>
          p.fetchHistoricalPrices
            ? (s: string) => p.fetchHistoricalPrices!(s, from, to)
            : undefined,
        )) ?? [],
      (result) => result.length === 0,
      [],
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
    const metrics = this.healthMonitor.getMetrics(providerId);
    if (!metrics)
      return { status: "enabled" as const, successRate: 1.0, avgLatency: 0 };
    return {
      status: metrics.status,
      successRate: this.healthMonitor.getSuccessRate(providerId) || 1.0,
      avgLatency: metrics.avgLatencyMs,
    };
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

    const providerMetadatas = this.registry.getProvidersForDataType("macro");

    for (const meta of providerMetadatas) {
      const credentials = await this.credentials.resolve(meta.name, userId);
      if (!credentials && meta.requiresKey) continue;

      const provider = ProviderFactory.create(meta.name, credentials);
      if (!provider?.fetchMacroIndicator) continue;

      if (this.isRateLimited(credentials, provider.name, meta)) continue;

      try {
        const result = await this.executeWithMonitoring(
          provider.name,
          () => provider.fetchMacroIndicator!(indicator),
          `macro(${indicator})`,
        );
        this.recordRateLimit(credentials, provider.name, meta);
        if (result != null) return result;
      } catch (error) {
        this.logger.warn(`Failed to fetch macro from ${provider.name}:`, error);
      }
    }

    return null;
  }

  resetRateLimits(): void {
    this.rateLimitTracker.reset();
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

    const providerMetadatas = this.registry.getProvidersForDataType(dataType);

    for (const meta of providerMetadatas) {
      const credentials = await this.credentials.resolve(meta.name, userId);
      if (!credentials && meta.requiresKey) continue;

      const provider =
        meta.name === "tradier"
          ? new TradierProvider(credentials)
          : ProviderFactory.create(meta.name, credentials);
      if (!provider) continue;

      const fetcher = getFetcher(provider);
      if (!fetcher) continue;

      if (this.isRateLimited(credentials, provider.name, meta)) continue;

      try {
        const result = await this.executeWithMonitoring(
          provider.name,
          () => fetcher(symbol),
          `${dataType}(${symbol})`,
        );
        this.recordRateLimit(credentials, provider.name, meta);
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
          const result = await this.executeWithMonitoring(
            provider.name,
            () => provider.fetchQuote(symbol),
            `fetchQuote(${symbol})`,
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

  private isRateLimited(
    credentials: Record<string, string> | null,
    providerName: string,
    meta: ProviderMetadata,
  ): boolean {
    const exhausted = this.rateLimitTracker.isExhausted(
      credentials,
      providerName,
      meta.rateLimitPerMinute,
      meta.rateLimitPerDay,
    );
    if (exhausted) {
      this.logger.debug(`Rate limit exhausted for ${providerName}, skipping`);
    }
    return exhausted;
  }

  private recordRateLimit(
    credentials: Record<string, string> | null,
    providerName: string,
    meta: ProviderMetadata,
  ): void {
    this.rateLimitTracker.record(
      credentials,
      providerName,
      meta.rateLimitPerMinute,
      meta.rateLimitPerDay,
    );
  }

  /**
   * Get (or lazily create) the circuit breaker for a provider. Rate-limit
   * errors are excluded from tripping the breaker — they indicate quota, not a
   * failing provider — matching the source project's breaker hardening.
   */
  private getBreaker(providerName: string): CircuitBreaker {
    let breaker = this.circuitBreakers.get(providerName);
    if (!breaker) {
      breaker = new CircuitBreaker({
        name: providerName,
        failureThreshold: 5,
        resetTimeoutMs: 60_000,
        logger: this.logger,
        isFailure: (error) =>
          !(
            error instanceof ProviderError &&
            error.code === ProviderErrorCode.RATE_LIMIT_EXCEEDED
          ),
      });
      this.circuitBreakers.set(providerName, breaker);
    }
    return breaker;
  }

  /**
   * Execute a provider operation with uniform resilience: a per-provider
   * circuit breaker plus health-metric recording. Transient-failure recovery is
   * handled by cross-provider fallback (and stale-on-error in the SWR cache),
   * so no per-call retry is layered on here.
   */
  private async executeWithMonitoring<T>(
    providerName: string,
    operation: () => Promise<T>,
    _operationName: string,
  ): Promise<T> {
    const startTime = Date.now();
    try {
      const result = await this.getBreaker(providerName).execute(operation);
      this.healthMonitor.recordRequest(providerName, {
        success: true,
        latencyMs: Date.now() - startTime,
        timestamp: new Date(),
      });
      return result;
    } catch (error) {
      this.healthMonitor.recordRequest(providerName, {
        success: false,
        latencyMs: Date.now() - startTime,
        timestamp: new Date(),
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}
