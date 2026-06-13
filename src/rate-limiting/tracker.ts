/**
 * Rate Limit Tracker
 *
 * Tracks per-key rate-limit consumption across minute/hour/day/month windows.
 * Budget is PER KEY (each credential set gets its own budget), not global.
 * Key = hash of credentials (never store raw keys).
 *
 * The window arithmetic lives here; the actual per-window state is held by an
 * injected RateLimitStore (in-memory by default, SQLite for durable budgets).
 */

import { createHash } from "node:crypto";
import { getLogger } from "../logging/index.js";
import type {
  RateLimitStore,
  RateLimitWindow,
  RateLimitWindowState,
} from "../ports/rate-limit-store.js";
import { InMemoryRateLimitStore } from "../adapters/rate-limit/in-memory-rate-limit-store.js";

const logger = getLogger("rate-limit-tracker", "packages/provider-aggregator");

const WINDOW_MS: Record<RateLimitWindow, number> = {
  minute: 60 * 1000,
  hour: 60 * 60 * 1000,
  day: 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000, // rolling 30-day window
};

const WINDOWS: RateLimitWindow[] = ["minute", "hour", "day", "month"];

/** Per-window request limits for a provider (null/undefined = no limit). */
export interface RateLimits {
  perMinute?: number | null;
  perHour?: number | null;
  perDay?: number | null;
  perMonth?: number | null;
}

/** Remaining requests per window; -1 means "no limit / not tracked". */
export interface RemainingBudget {
  minute: number;
  hour: number;
  day: number;
  month: number;
}

function limitFor(limits: RateLimits, window: RateLimitWindow): number | null {
  switch (window) {
    case "minute":
      return limits.perMinute ?? null;
    case "hour":
      return limits.perHour ?? null;
    case "day":
      return limits.perDay ?? null;
    case "month":
      return limits.perMonth ?? null;
  }
}

export class RateLimitTracker {
  constructor(
    private readonly store: RateLimitStore = new InMemoryRateLimitStore(),
  ) {}

  /** Record one consumed request against every window that has a limit. */
  record(
    credentials: Record<string, string> | null,
    providerName: string,
    limits: RateLimits,
  ): void {
    const keyHash = this.hashCredentials(credentials);
    const now = Date.now();

    for (const window of WINDOWS) {
      const limit = limitFor(limits, window);
      if (limit === null) continue;

      const state = this.store.get(keyHash, providerName, window);
      const next: RateLimitWindowState =
        state && now - state.windowStart < WINDOW_MS[window]
          ? { used: state.used + 1, limit, windowStart: state.windowStart }
          : { used: 1, limit, windowStart: now };
      this.store.set(keyHash, providerName, window, next);
    }

    logger.debug("Rate limit recorded", { provider: providerName });
  }

  /** True if any window with a limit is at/over quota in its active period. */
  isExhausted(
    credentials: Record<string, string> | null,
    providerName: string,
    limits: RateLimits,
  ): boolean {
    const keyHash = this.hashCredentials(credentials);
    const now = Date.now();

    for (const window of WINDOWS) {
      const limit = limitFor(limits, window);
      if (limit === null) continue;

      const state = this.store.get(keyHash, providerName, window);
      if (!state) continue;
      if (now - state.windowStart >= WINDOW_MS[window]) continue; // expired → fresh
      if (state.used >= limit) return true;
    }

    return false;
  }

  /** Remaining budget per window for a provider (-1 if not limited/tracked). */
  getRemainingBudget(
    credentials: Record<string, string> | null,
    providerName: string,
  ): RemainingBudget {
    const keyHash = this.hashCredentials(credentials);
    const now = Date.now();
    const remaining: RemainingBudget = {
      minute: -1,
      hour: -1,
      day: -1,
      month: -1,
    };

    for (const window of WINDOWS) {
      const state = this.store.get(keyHash, providerName, window);
      if (!state) continue;
      remaining[window] =
        now - state.windowStart >= WINDOW_MS[window]
          ? state.limit
          : Math.max(0, state.limit - state.used);
    }

    return remaining;
  }

  reset(): void {
    this.store.reset();
    logger.debug("Rate limit tracker reset");
  }

  private hashCredentials(credentials: Record<string, string> | null): string {
    if (!credentials) {
      return "no-key";
    }
    const keyString = JSON.stringify(credentials);
    return createHash("sha256").update(keyString).digest("hex").slice(0, 16);
  }
}

let trackerInstance: RateLimitTracker | null = null;

export function getRateLimitTracker(): RateLimitTracker {
  if (!trackerInstance) {
    trackerInstance = new RateLimitTracker();
  }
  return trackerInstance;
}

export function resetRateLimitTracker(): void {
  if (trackerInstance) {
    trackerInstance.reset();
  }
}
