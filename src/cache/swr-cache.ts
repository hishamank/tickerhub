/**
 * SWR Cache Implementation
 *
 * Implements Stale-While-Revalidate caching strategy over an injected Cache.
 *
 * Flow:
 * 1. Check cache
 * 2. If fresh → return cached data
 * 3. If stale → return cached data + trigger background refresh
 * 4. If expired/miss → fetch and cache
 * 5. If fetch fails + stale cache exists → return stale (graceful degradation)
 */

import { getLogger } from "../logging/index.js";
import type { Cache } from "../ports/cache.js";
import type { Logger } from "../ports/logger.js";
import { generateCacheKey } from "./key-generator.js";
import { getTTL } from "./ttl-config.js";
import type { CacheEntry, SwrOptions, CacheStats } from "../types/cache.js";
import type { MarketDataResponse } from "../types/provider.js";

export class SwrCache {
  private inFlightRequests = new Map<string, Promise<unknown>>();
  private readonly cache: Cache;
  private readonly logger: Logger;

  // Metrics tracking
  private metrics = {
    hits: 0,
    misses: 0,
    staleServes: 0,
    backgroundRefreshes: 0,
  };

  constructor(cache: Cache, logger?: Logger) {
    this.cache = cache;
    this.logger = logger ?? getLogger("swr-cache");
  }

  /**
   * Get data with SWR strategy.
   */
  async get<T>(
    functionName: string,
    params: unknown[],
    fetcher: () => Promise<T>,
    options?: SwrOptions,
  ): Promise<MarketDataResponse<T>> {
    const key = generateCacheKey(functionName, ...params);
    const { staleAfter, maxAge } = this.resolveTTL(functionName, options);

    const startTime = Date.now();

    // Force refresh requested
    if (options?.forceRefresh) {
      const data = await this.fetchAndCache(key, fetcher, staleAfter, maxAge);
      return {
        data,
        metadata: {
          source: "provider",
          provider: "aggregator",
          cached: false,
          stale: false,
          retrievedAt: new Date(),
          latencyMs: Date.now() - startTime,
        },
      };
    }

    const cached = await this.getCached<T>(key);

    if (cached) {
      const now = Date.now();

      // Fresh data - return immediately
      if (now < cached.staleAt) {
        this.metrics.hits++;
        this.logger.debug(`Cache hit (fresh): ${key}`);
        return {
          data: cached.data,
          metadata: {
            source: "cache",
            provider: "cache",
            cached: true,
            stale: false,
            retrievedAt: new Date(cached.fetchedAt),
            latencyMs: Date.now() - startTime,
          },
        };
      }

      // Stale but not expired - return stale + background refresh
      if (now < cached.expiresAt) {
        this.metrics.hits++;
        this.metrics.staleServes++;
        this.logger.debug(`Cache hit (stale, refreshing): ${key}`);
        this.backgroundRefresh(key, fetcher, staleAfter, maxAge);
        return {
          data: cached.data,
          metadata: {
            source: "cache",
            provider: "cache",
            cached: true,
            stale: true,
            retrievedAt: new Date(cached.fetchedAt),
            latencyMs: Date.now() - startTime,
          },
        };
      }
    }

    // Cache miss or expired - fetch fresh
    this.metrics.misses++;
    try {
      const data = await this.fetchAndCache(key, fetcher, staleAfter, maxAge);
      return {
        data,
        metadata: {
          source: "provider",
          provider: "aggregator",
          cached: false,
          stale: false,
          retrievedAt: new Date(),
          latencyMs: Date.now() - startTime,
        },
      };
    } catch (error) {
      // Graceful degradation: return stale cache on error
      if (cached) {
        this.logger.warn(`Fetch failed, returning stale cache: ${key}`, {
          error,
        });
        return {
          data: cached.data,
          metadata: {
            source: "cache",
            provider: "cache",
            cached: true,
            stale: true,
            retrievedAt: new Date(cached.fetchedAt),
            latencyMs: Date.now() - startTime,
            warnings: ["Fetch failed, returned stale data from cache"],
          },
        };
      }
      throw error;
    }
  }

  /** Invalidate cache entries matching a pattern. */
  async invalidate(pattern: string): Promise<void> {
    await this.cache.deletePattern(`provider-aggregator:${pattern}*`);
    this.logger.info(`Cache invalidated: ${pattern}`);
  }

  /** Invalidate all cache for a symbol. */
  async invalidateSymbol(symbol: string): Promise<void> {
    await this.invalidate(`*:${symbol.toUpperCase()}*`);
  }

  /** Get cache statistics. */
  async getStats(): Promise<CacheStats> {
    const totalRequests = this.metrics.hits + this.metrics.misses;

    if (totalRequests === 0) {
      return {
        hitRate: 0,
        missRate: 0,
        staleServes: 0,
        backgroundRefreshes: 0,
      };
    }

    return {
      hitRate: this.metrics.hits / totalRequests,
      missRate: this.metrics.misses / totalRequests,
      staleServes: this.metrics.staleServes,
      backgroundRefreshes: this.metrics.backgroundRefreshes,
    };
  }

  /** Reset cache statistics (useful for testing). */
  resetStats(): void {
    this.metrics = {
      hits: 0,
      misses: 0,
      staleServes: 0,
      backgroundRefreshes: 0,
    };
  }

  private async getCached<T>(key: string): Promise<CacheEntry<T> | null> {
    try {
      return await this.cache.get<CacheEntry<T>>(key);
    } catch {
      return null;
    }
  }

  private async fetchAndCache<T>(
    key: string,
    fetcher: () => Promise<T>,
    staleAfter: number,
    maxAge: number,
  ): Promise<T> {
    // Deduplicate concurrent requests for same key
    const inFlight = this.inFlightRequests.get(key);
    if (inFlight) {
      this.logger.debug(`Request coalesced: ${key}`);
      return inFlight as Promise<T>;
    }

    const promise = (async () => {
      try {
        const data = await fetcher();
        const now = Date.now();

        const entry: CacheEntry<T> = {
          data,
          fetchedAt: now,
          staleAt: now + staleAfter * 1000,
          expiresAt: now + maxAge * 1000,
        };

        await this.cache.set(key, entry, maxAge);
        this.logger.debug(
          `Cache set: ${key} (stale: ${staleAfter}s, max: ${maxAge}s)`,
        );

        return data;
      } finally {
        this.inFlightRequests.delete(key);
      }
    })();

    this.inFlightRequests.set(key, promise);
    return promise;
  }

  private backgroundRefresh<T>(
    key: string,
    fetcher: () => Promise<T>,
    staleAfter: number,
    maxAge: number,
  ): void {
    this.metrics.backgroundRefreshes++;
    // Don't await - fire and forget
    this.fetchAndCache(key, fetcher, staleAfter, maxAge).catch((error) => {
      this.logger.warn(`Background refresh failed: ${key}`, { error });
    });
  }

  private resolveTTL(
    functionName: string,
    options?: SwrOptions,
  ): { staleAfter: number; maxAge: number } {
    const defaults = getTTL(functionName);
    return {
      staleAfter: options?.staleAfter ?? defaults.staleAfter,
      maxAge: options?.maxAge ?? defaults.maxAge,
    };
  }
}
