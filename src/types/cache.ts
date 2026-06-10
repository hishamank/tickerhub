/**
 * Cache Types
 *
 * Defines types for the SWR caching system.
 */

/**
 * Cache entry with SWR metadata
 */
export interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
  expiresAt: number;
  staleAt: number;
}

/**
 * SWR cache options
 */
export interface SwrOptions {
  /** Time in seconds before data is considered stale (triggers background refresh) */
  staleAfter?: number;
  /** Time in seconds before data expires completely */
  maxAge?: number;
  /** Force fresh fetch, ignoring cache */
  forceRefresh?: boolean;
}

/**
 * TTL configuration for a specific operation
 */
export interface TTLConfig {
  /** Seconds before data is considered stale */
  staleAfter: number;
  /** Seconds before data expires completely */
  maxAge: number;
}

/**
 * Cache statistics
 */
export interface CacheStats {
  hitRate: number;
  missRate: number;
  staleServes: number;
  backgroundRefreshes: number;
}
