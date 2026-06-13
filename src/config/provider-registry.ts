/**
 * Provider Registry
 *
 * Merges built-in provider defaults with ConfigStore-supplied overrides so that
 * keyless providers (e.g. yahoo-finance) remain available even when the store
 * is sparse or empty.
 *
 * Resolution order:
 *  1. Load all override rows from the ConfigStore (enabled and disabled)
 *  2. Start from built-in defaults (BUILTIN_PROVIDERS)
 *  3. Override rows replace built-in metadata by provider name
 *  4. Providers only in the store (not built-in) are included as-is
 *  5. Built-in providers with no override stay enabled with default metadata
 *
 * Refactored from the source module-singleton into an injectable class so the
 * persistence backend (ConfigStore) and logger are dependencies, not globals.
 */

import type { ConfigStore } from "../ports/config-store.js";
import type { Logger } from "../ports/logger.js";
import { getLogger } from "../logging/index.js";
import type { DataType } from "../types/provider.js";
import {
  BUILTIN_PROVIDERS,
  DEFAULT_PROVIDER_PRIORITIES,
} from "./default-priorities.js";

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export interface ProviderMetadata {
  name: string;
  providerType: string;
  requiresKey: boolean;
  rateLimitPerMinute: number | null;
  rateLimitPerHour: number | null;
  rateLimitPerDay: number | null;
  rateLimitPerMonth: number | null;
  reliabilityScore: number;
  enabled: boolean;
  paidTier: boolean;
  supportedDataTypes: string[];
  priority: number;
}

interface CacheEntry {
  providers: Map<string, ProviderMetadata>;
  fetchedAt: number;
}

/**
 * Find the lowest (best) priority index for a provider across all data types.
 * Falls back to 99 if the provider isn't in any default priority list.
 */
function findLowestPriority(providerName: string): number {
  let best = 99;
  for (const providers of Object.values(DEFAULT_PROVIDER_PRIORITIES)) {
    const idx = providers.indexOf(providerName);
    if (idx !== -1 && idx < best) best = idx;
  }
  return best;
}

function buildBuiltinDefaults(): Map<string, ProviderMetadata> {
  const providers = new Map<string, ProviderMetadata>();
  for (const builtin of BUILTIN_PROVIDERS) {
    providers.set(builtin.name, {
      name: builtin.name,
      providerType: builtin.providerType,
      requiresKey: builtin.requiresKey,
      rateLimitPerMinute: builtin.rateLimitPerMinute,
      rateLimitPerHour: builtin.rateLimitPerHour,
      rateLimitPerDay: builtin.rateLimitPerDay,
      rateLimitPerMonth: builtin.rateLimitPerMonth,
      reliabilityScore: builtin.reliabilityScore,
      enabled: true,
      paidTier: builtin.paidTier,
      supportedDataTypes: builtin.supportedDataTypes,
      priority: findLowestPriority(builtin.name),
    });
  }
  return providers;
}

export class ProviderRegistry {
  private cache: CacheEntry | null = null;
  private readonly logger: Logger;

  constructor(
    private readonly configStore: ConfigStore,
    logger?: Logger,
  ) {
    this.logger = logger ?? getLogger("provider-registry");
  }

  private async fetchAndMerge(): Promise<Map<string, ProviderMetadata>> {
    const providers = buildBuiltinDefaults();
    const rows = await this.configStore.getAllConfigs();

    let overrides = 0;
    let storeOnly = 0;

    for (const row of rows) {
      const metadata: ProviderMetadata = {
        name: row.name,
        providerType: row.providerType,
        requiresKey: row.requiresKey,
        rateLimitPerMinute: row.rateLimitPerMinute,
        rateLimitPerHour: row.rateLimitPerHour,
        rateLimitPerDay: row.rateLimitPerDay,
        rateLimitPerMonth: row.rateLimitPerMonth,
        reliabilityScore: row.reliabilityScore,
        enabled: row.enabled,
        paidTier: row.paidTier,
        supportedDataTypes: row.supportedDataTypes,
        priority: row.priority,
      };
      if (providers.has(row.name)) overrides++;
      else storeOnly++;
      providers.set(row.name, metadata);
    }

    const builtinOnly = providers.size - overrides - storeOnly;
    this.logger.info(
      `Provider registry loaded: ${providers.size} total ` +
        `(${overrides} overrides, ${builtinOnly} built-in defaults, ${storeOnly} store-only)`,
    );
    return providers;
  }

  /** Load (or return cached) registry, refreshing after the TTL. */
  async load(): Promise<Map<string, ProviderMetadata>> {
    const now = Date.now();
    if (this.cache && now - this.cache.fetchedAt < CACHE_TTL_MS) {
      return this.cache.providers;
    }
    try {
      const providers = await this.fetchAndMerge();
      this.cache = { providers, fetchedAt: now };
    } catch (error) {
      if (this.cache) {
        this.logger.warn(
          "Failed to refresh provider registry, using stale cache",
          { error },
        );
        return this.cache.providers;
      }
      throw error;
    }
    return this.cache.providers;
  }

  async refresh(): Promise<void> {
    this.cache = null;
    await this.load();
  }

  getProvidersForDataType(dataType: DataType): ProviderMetadata[] {
    const registry = this.cache?.providers;
    if (!registry) {
      this.logger.warn("Provider registry not loaded, call load() first");
      return [];
    }

    const providersForType: ProviderMetadata[] = [];
    for (const provider of registry.values()) {
      if (provider.supportedDataTypes.includes(dataType) && provider.enabled) {
        providersForType.push(provider);
      }
    }

    const defaultOrder = DEFAULT_PROVIDER_PRIORITIES[dataType] ?? [];
    providersForType.sort((a, b) => {
      const aDefault = defaultOrder.indexOf(a.name);
      const bDefault = defaultOrder.indexOf(b.name);
      const aInDefaults = aDefault !== -1;
      const bInDefaults = bDefault !== -1;
      if (a.priority !== b.priority) return a.priority - b.priority;
      if (aInDefaults && bInDefaults) return aDefault - bDefault;
      if (aInDefaults !== bInDefaults) return aInDefaults ? -1 : 1;
      return b.reliabilityScore - a.reliabilityScore;
    });

    return providersForType;
  }

  getProviderByName(name: string): ProviderMetadata | undefined {
    return this.cache?.providers.get(name);
  }

  isProviderEnabled(providerName: string): boolean {
    return this.cache?.providers.get(providerName)?.enabled ?? false;
  }

  async getEnabledProviders(): Promise<string[]> {
    await this.load();
    if (!this.cache?.providers) return [];
    const enabled: string[] = [];
    for (const [, provider] of this.cache.providers) {
      if (provider.enabled) enabled.push(provider.name);
    }
    return enabled;
  }

  /** Clear the in-memory cache (test helper). */
  clearCache(): void {
    this.cache = null;
  }
}
