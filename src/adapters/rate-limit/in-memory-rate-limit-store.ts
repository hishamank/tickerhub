/**
 * InMemoryRateLimitStore — default RateLimitStore adapter.
 *
 * Holds per-window usage in a process-local Map. State resets on restart, so
 * long-window budgets (daily/monthly) are best-effort here; use the
 * SqliteRateLimitStore from `/sqlite` for durable budgets.
 */

import type {
  RateLimitStore,
  RateLimitWindow,
  RateLimitWindowState,
} from "../../ports/rate-limit-store.js";

export class InMemoryRateLimitStore implements RateLimitStore {
  private readonly data = new Map<string, RateLimitWindowState>();

  private key(keyHash: string, provider: string, window: RateLimitWindow): string {
    return `${keyHash}:${provider}:${window}`;
  }

  get(
    keyHash: string,
    provider: string,
    window: RateLimitWindow,
  ): RateLimitWindowState | null {
    return this.data.get(this.key(keyHash, provider, window)) ?? null;
  }

  set(
    keyHash: string,
    provider: string,
    window: RateLimitWindow,
    state: RateLimitWindowState,
  ): void {
    this.data.set(this.key(keyHash, provider, window), state);
  }

  reset(): void {
    this.data.clear();
  }
}
