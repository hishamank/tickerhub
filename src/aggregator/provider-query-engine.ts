/**
 * ProviderQueryEngine — the generic provider-iteration core.
 *
 * Resolves credentials, skips key-less and rate-limited providers, and tries
 * each supporting provider in priority order, returning the first non-null
 * result. Extracted from SmartAggregator so the aggregator (and its
 * asset-class sub-aggregators) stay focused on per-data-type wiring rather than
 * the shared selection/fallback loop.
 */

import type { DataType, MarketDataProvider } from "../types/index.js";
import type { Logger } from "../ports/logger.js";
import type { CredentialProvider } from "../ports/credential-provider.js";
import { ProviderFactory } from "../providers/provider-factory.js";
import { TradierProvider } from "../providers/tradier.js";
import { ProviderRegistry } from "../config/provider-registry.js";
import { ProviderExecutor } from "./provider-executor.js";

export class ProviderQueryEngine {
  private registryReady: Promise<void> | null;

  constructor(
    private readonly registry: ProviderRegistry,
    private readonly credentials: CredentialProvider,
    private readonly executor: ProviderExecutor,
    private readonly logger: Logger,
  ) {
    this.registryReady = this.registry.load().then(() => {});
  }

  /** Wait for the registry to be loaded before querying providers. */
  async ensureRegistry(): Promise<void> {
    if (this.registryReady) {
      await this.registryReady;
      this.registryReady = null;
    }
  }

  /**
   * Try every provider that supports `dataType`, in priority order: resolve
   * credentials, skip if a required key is missing or the quota is exhausted,
   * execute through the breaker, record the call, and return the first
   * non-null result.
   */
  async tryProviders<T>(
    dataType: DataType,
    symbol: string,
    userId: string,
    getFetcher: (
      provider: MarketDataProvider,
    ) => ((symbol: string) => Promise<T>) | undefined,
    accept: (result: T) => boolean = (result) => result != null,
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
        if (accept(result)) return result;
      } catch (error) {
        this.logger.warn(
          `Failed to fetch ${dataType} from ${provider.name}:`,
          error,
        );
      }
    }
    return null;
  }

  /**
   * List variant: returns the first provider's non-empty array (no ADR
   * fallback), or `[]` if none yield results.
   */
  async tryProvidersList<T>(
    dataType: DataType,
    arg: string,
    userId: string,
    getFetcher: (
      provider: MarketDataProvider,
    ) => ((arg: string) => Promise<T[]>) | undefined,
  ): Promise<T[]> {
    return (
      (await this.tryProviders<T[]>(
        dataType,
        arg,
        userId,
        getFetcher,
        (result) => Array.isArray(result) && result.length > 0,
      )) ?? []
    );
  }
}
