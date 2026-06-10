/**
 * InMemoryCache — default Cache adapter.
 *
 * A process-local TTL cache backed by a Map. Zero dependencies; suitable for
 * single-process use, tests, and as the no-config default. For multi-process
 * deployments use the Redis adapter from `/redis`.
 *
 * Values are stored by reference (no serialization), so callers must treat
 * returned values as read-only.
 */

import type { Cache } from "../../ports/cache.js";

interface Entry {
  value: unknown;
  /** Epoch ms when the entry expires, or null for no expiry. */
  expiresAt: number | null;
}

/** Convert a glob pattern (`*` wildcard) into an anchored RegExp. */
function globToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const withWildcard = escaped.replace(/\\\*/g, ".*");
  return new RegExp(`^${withWildcard}$`);
}

export class InMemoryCache implements Cache {
  private readonly store = new Map<string, Entry>();

  async get<T>(key: string): Promise<T | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && Date.now() >= entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const expiresAt =
      ttlSeconds !== undefined && ttlSeconds > 0
        ? Date.now() + ttlSeconds * 1000
        : null;
    this.store.set(key, { value, expiresAt });
  }

  async deletePattern(pattern: string): Promise<number> {
    const regex = globToRegExp(pattern);
    let removed = 0;
    for (const key of this.store.keys()) {
      if (regex.test(key)) {
        this.store.delete(key);
        removed++;
      }
    }
    return removed;
  }

  /** Remove all entries (test helper). */
  clear(): void {
    this.store.clear();
  }
}
