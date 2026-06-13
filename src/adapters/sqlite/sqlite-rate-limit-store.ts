/**
 * SqliteRateLimitStore — SQLite-backed RateLimitStore adapter.
 *
 * Persists per-key, per-provider, per-window usage so daily/monthly budgets
 * survive process restarts and are shared across instances pointing at the same
 * DB file. Synchronous, matching the port and the better-sqlite3 driver.
 */

import type { Database } from "better-sqlite3";
import type {
  RateLimitStore,
  RateLimitWindow,
  RateLimitWindowState,
} from "../../ports/rate-limit-store.js";
import { ensureSchema } from "./schema.js";

interface UsageRow {
  used: number;
  limit_value: number;
  window_start: number;
}

export class SqliteRateLimitStore implements RateLimitStore {
  constructor(private readonly db: Database) {
    ensureSchema(this.db);
  }

  get(
    keyHash: string,
    provider: string,
    window: RateLimitWindow,
  ): RateLimitWindowState | null {
    const row = this.db
      .prepare(
        `SELECT used, limit_value, window_start FROM rate_limit_usage
         WHERE key_hash = ? AND provider = ? AND window_type = ?`,
      )
      .get(keyHash, provider, window) as UsageRow | undefined;

    if (!row) return null;
    return {
      used: row.used,
      limit: row.limit_value,
      windowStart: row.window_start,
    };
  }

  set(
    keyHash: string,
    provider: string,
    window: RateLimitWindow,
    state: RateLimitWindowState,
  ): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO rate_limit_usage
         (key_hash, provider, window_type, window_start, used, limit_value)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(keyHash, provider, window, state.windowStart, state.used, state.limit);
  }

  reset(): void {
    this.db.prepare("DELETE FROM rate_limit_usage").run();
  }
}
