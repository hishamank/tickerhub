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
import { sanitizeSecrets } from "../providers/provider-utils.js";
import { reportProviderFailure } from "../resilience/attempt-report.js";
import { TradierProvider } from "../providers/tradier.js";
import {
  RequestBudgetExhaustedError,
  withRequestBudget,
} from "../resilience/request-budget.js";
import {
  ProviderRegistry,
  type ProviderMetadata,
} from "../config/provider-registry.js";
import { ProviderError, ProviderErrorCode } from "../types/provider.js";
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
   * execute through the breaker with quota accounting, and return the first
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

      const provider: MarketDataProvider | null =
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
        // Inside the breaker's operation, so an open circuit spends nothing.
        const result = await this.executor.execute(provider.name, () =>
          provider.meteredPerHttpRequest
            ? withRequestBudget(
                () => this.claimRequest(credentials, provider.name, meta),
                () => fetcher(symbol),
              )
            : this.countLogicalCall(credentials, provider.name, meta, () =>
                fetcher(symbol),
              ),
        );
        if (accept(result)) return result;
      } catch (error) {
        const message = sanitizeSecrets(
          error instanceof Error ? error.message : String(error),
          Object.values(credentials ?? {}),
        );
        this.logger.warn(
          `Failed to fetch ${dataType} from ${provider.name}: ${message}`,
        );
        reportProviderFailure(`${provider.name} (${dataType}): ${message}`);
      }
    }
    return null;
  }

  /**
   * Check and record in one synchronous step, immediately before a real HTTP
   * request, so concurrent attempts cannot both take the last unit.
   */
  private claimRequest(
    credentials: Record<string, string> | null,
    providerName: string,
    meta: ProviderMetadata,
  ): void {
    if (this.executor.isRateLimited(credentials, providerName, meta)) {
      throw new RequestBudgetExhaustedError(providerName);
    }
    this.executor.recordRateLimit(credentials, providerName, meta);
  }

  /**
   * Accounting for providers that do not report their HTTP requests: one unit
   * per call, including failed ones. A call rejected as invalid is not counted,
   * since symbol validation throws that before any request is sent.
   */
  private async countLogicalCall<T>(
    credentials: Record<string, string> | null,
    providerName: string,
    meta: ProviderMetadata,
    call: () => Promise<T>,
  ): Promise<T> {
    try {
      const result = await call();
      this.executor.recordRateLimit(credentials, providerName, meta);
      return result;
    } catch (error) {
      const invalidRequest =
        error instanceof ProviderError &&
        error.code === ProviderErrorCode.INVALID_REQUEST;
      if (!invalidRequest) {
        this.executor.recordRateLimit(credentials, providerName, meta);
      }
      throw error;
    }
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
