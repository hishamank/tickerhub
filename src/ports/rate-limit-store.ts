/**
 * RateLimitStore port.
 *
 * Persists per-key, per-provider rate-limit usage so daily/monthly budgets can
 * survive process restarts. The default `InMemoryRateLimitStore` keeps state in
 * a Map (resets per process); a `SqliteRateLimitStore` is available from
 * `/sqlite` for durable budgets.
 *
 * Intentionally SYNCHRONOUS: the only backends are an in-memory Map and the
 * synchronous `better-sqlite3` driver, and the tracker is on the hot path of
 * every provider attempt. The window arithmetic lives in the tracker; the store
 * is a dumb per-window state container.
 */

export type RateLimitWindow = "minute" | "hour" | "day" | "month";

export interface RateLimitWindowState {
  /** Requests consumed in the current window. */
  used: number;
  /** The limit in effect when the window opened (for remaining-budget reports). */
  limit: number;
  /** Epoch ms at which the current window began. */
  windowStart: number;
}

export interface RateLimitStore {
  /** Current state for a (key, provider, window), or null if none recorded. */
  get(
    keyHash: string,
    provider: string,
    window: RateLimitWindow,
  ): RateLimitWindowState | null;

  /** Persist the state for a (key, provider, window). */
  set(
    keyHash: string,
    provider: string,
    window: RateLimitWindow,
    state: RateLimitWindowState,
  ): void;

  /** Clear all recorded usage. */
  reset(): void;
}
