/**
 * Composition root.
 *
 * `createAggregator` wires the service graph from a set of ports, filling in
 * zero-config defaults (in-memory cache, env credentials, in-memory stores,
 * console logging) for anything the caller doesn't supply.
 */

import type { Logger } from "./ports/logger.js";
import type { Cache } from "./ports/cache.js";
import type { CredentialProvider } from "./ports/credential-provider.js";
import type { ConfigStore } from "./ports/config-store.js";
import type { HealthMetricsStore } from "./ports/health-store.js";

import { setLoggerFactory } from "./logging/index.js";
import { InMemoryCache } from "./adapters/cache/in-memory-cache.js";
import {
  EnvCredentialProvider,
  type EnvRecord,
} from "./adapters/credentials/env-credential-provider.js";
import { InMemoryConfigStore } from "./adapters/stores/in-memory-config-store.js";
import { InMemoryHealthStore } from "./adapters/stores/in-memory-health-store.js";

import { ProviderRegistry } from "./config/provider-registry.js";
import { SmartAggregator } from "./aggregator/smart-aggregator.js";
import { SwrCache } from "./cache/swr-cache.js";
import { HealthMonitor } from "./health/health-monitor.js";
import { flushHealthMetrics } from "./health/flush.js";
import { ProviderHealthRepository } from "./repositories/provider-health-repository.js";
import { ProviderAggregatorService } from "./services/provider-aggregator.service.js";

export interface CreateAggregatorOptions {
  /** Logger for all internal modules. Default: namespaced ConsoleLogger. */
  logger?: Logger;
  /** Cache backend. Default: in-memory TTL cache. */
  cache?: Cache;
  /** Credential resolution. Default: EnvCredentialProvider over `env`. */
  credentials?: CredentialProvider;
  /** Provider-config override store. Default: in-memory (built-in defaults only). */
  configStore?: ConfigStore;
  /** Health-metrics store. Default: in-memory ring buffer. */
  healthStore?: HealthMetricsStore;
  /**
   * Environment record for the default EnvCredentialProvider. Ignored if
   * `credentials` is supplied. Default: `process.env`.
   */
  env?: EnvRecord;
}

/**
 * The wired aggregator: the SWR-cached service plus the building blocks, so
 * callers can run health workflows or inspect the registry if they need to.
 */
export interface Aggregator {
  service: ProviderAggregatorService;
  registry: ProviderRegistry;
  healthRepository: ProviderHealthRepository;
  /** Live in-memory health monitor shared with the aggregator. */
  healthMonitor: HealthMonitor;
  /**
   * Snapshot current provider health into the configured health store.
   * Call on an interval (e.g. every 30s) for a durable time series. Returns
   * the number of records written.
   */
  flushHealthMetrics: () => Promise<number>;
}

/**
 * Create a fully-wired aggregator. With no options, everything runs in-process
 * with credentials read from `process.env`.
 */
export function createAggregator(
  options: CreateAggregatorOptions = {},
): Aggregator {
  // Route all internal logging through the supplied logger, if any.
  if (options.logger) {
    const provided = options.logger;
    setLoggerFactory(() => provided);
  }

  const cache = options.cache ?? new InMemoryCache();
  const credentials =
    options.credentials ?? new EnvCredentialProvider(options.env);
  const configStore = options.configStore ?? new InMemoryConfigStore();
  const healthStore = options.healthStore ?? new InMemoryHealthStore();

  // One HealthMonitor shared between the aggregator (which records into it) and
  // the flush helper (which snapshots it to the store).
  const healthMonitor = new HealthMonitor();

  const registry = new ProviderRegistry(configStore, options.logger);
  const aggregator = new SmartAggregator({
    registry,
    credentials,
    healthMonitor,
    ...(options.logger ? { logger: options.logger } : {}),
  });
  const swrCache = new SwrCache(cache, options.logger);
  const service = new ProviderAggregatorService(aggregator, swrCache);
  const healthRepository = new ProviderHealthRepository(
    configStore,
    healthStore,
  );

  return {
    service,
    registry,
    healthRepository,
    healthMonitor,
    flushHealthMetrics: () => flushHealthMetrics(healthMonitor, healthStore),
  };
}
