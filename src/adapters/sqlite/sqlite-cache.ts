/**
 * SqliteCache — SQLite-backed Cache adapter.
 *
 * A durable implementation of the `Cache` port (the same one InMemoryCache and
 * RedisCache implement), so SWR-cached responses survive process restarts
 * without requiring Redis. Stale-while-revalidate semantics live in `SwrCache`;
 * this layer only stores key → value with an optional expiry.
 *
 * Values are JSON-serialized. `expires_at` is epoch ms (null = never expires).
 */

import type { Database } from "better-sqlite3";
import type { Cache } from "../../ports/cache.js";
import { ensureSchema } from "./schema.js";

interface CacheRow {
  value: string;
  expires_at: number | null;
}

export class SqliteCache implements Cache {
  constructor(private readonly db: Database) {
    ensureSchema(this.db);
  }

  async get<T>(key: string): Promise<T | null> {
    const row = this.db
      .prepare("SELECT value, expires_at FROM cache_entries WHERE key = ?")
      .get(key) as CacheRow | undefined;

    if (!row) return null;
    if (row.expires_at !== null && row.expires_at <= Date.now()) {
      this.db.prepare("DELETE FROM cache_entries WHERE key = ?").run(key);
      return null;
    }
    return JSON.parse(row.value) as T;
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const expiresAt =
      ttlSeconds === undefined ? null : Date.now() + ttlSeconds * 1000;
    this.db
      .prepare(
        `INSERT OR REPLACE INTO cache_entries (key, value, expires_at)
         VALUES (?, ?, ?)`,
      )
      .run(key, JSON.stringify(value), expiresAt);
  }

  async deletePattern(pattern: string): Promise<number> {
    // Translate the glob `*` wildcard to SQL LIKE `%`, escaping LIKE specials.
    const like = pattern
      .replace(/\\/g, "\\\\")
      .replace(/%/g, "\\%")
      .replace(/_/g, "\\_")
      .replace(/\*/g, "%");
    const result = this.db
      .prepare("DELETE FROM cache_entries WHERE key LIKE ? ESCAPE '\\'")
      .run(like);
    return result.changes;
  }
}
