/**
 * Cache port.
 *
 * The minimal cache surface the SWR layer needs. The default is `InMemoryCache`
 * (TTL Map). A Redis-backed adapter is available from `/redis`. Implement this
 * interface to plug in any other backend.
 */
export interface Cache {
  /** Get a value by key, or null if missing/expired. */
  get<T>(key: string): Promise<T | null>;

  /** Set a value with an optional TTL in seconds (no TTL = never expires). */
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;

  /**
   * Delete all keys matching a glob-style pattern (`*` wildcard).
   * Returns the number of keys removed.
   */
  deletePattern(pattern: string): Promise<number>;
}
