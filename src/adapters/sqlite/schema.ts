/**
 * SQLite schema for the optional persistence adapters.
 *
 * Booleans are stored as 0/1 integers, timestamps as epoch milliseconds, and
 * `supported_data_types` as a JSON-encoded string array. One DB file backs all
 * four adapters: config, health metrics, response cache, and rate-limit usage.
 */

import type { Database } from "better-sqlite3";

export const SQLITE_SCHEMA = `
CREATE TABLE IF NOT EXISTS provider_configs (
  name TEXT PRIMARY KEY,
  provider_type TEXT NOT NULL,
  requires_key INTEGER NOT NULL,
  rate_limit_per_minute INTEGER,
  rate_limit_per_hour INTEGER,
  rate_limit_per_day INTEGER,
  rate_limit_per_month INTEGER,
  reliability_score REAL NOT NULL,
  enabled INTEGER NOT NULL,
  paid_tier INTEGER NOT NULL,
  supported_data_types TEXT NOT NULL,
  priority INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS provider_health_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider_name TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  success_count INTEGER NOT NULL,
  failure_count INTEGER NOT NULL,
  avg_latency_ms INTEGER NOT NULL,
  consecutive_failures INTEGER NOT NULL,
  status TEXT NOT NULL,
  last_success_at INTEGER,
  last_failure_at INTEGER,
  disabled_at INTEGER,
  disabled_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_health_provider_ts
  ON provider_health_metrics (provider_name, timestamp);

CREATE TABLE IF NOT EXISTS cache_entries (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  expires_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_cache_expires
  ON cache_entries (expires_at);

CREATE TABLE IF NOT EXISTS rate_limit_usage (
  key_hash TEXT NOT NULL,
  provider TEXT NOT NULL,
  window_type TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  used INTEGER NOT NULL,
  limit_value INTEGER NOT NULL,
  PRIMARY KEY (key_hash, provider, window_type)
);
`;

/** Columns added after the initial release; ALTERed in for older DBs. */
const PROVIDER_CONFIG_ADDED_COLUMNS: ReadonlyArray<readonly [string, string]> = [
  ["rate_limit_per_hour", "INTEGER"],
  ["rate_limit_per_month", "INTEGER"],
];

/**
 * Create the schema (idempotent) and migrate older DBs by adding any columns
 * introduced after their creation. Safe to call on every store construction.
 */
export function ensureSchema(db: Database): void {
  db.exec(SQLITE_SCHEMA);

  const existing = new Set(
    (
      db.prepare("PRAGMA table_info(provider_configs)").all() as {
        name: string;
      }[]
    ).map((c) => c.name),
  );
  for (const [column, type] of PROVIDER_CONFIG_ADDED_COLUMNS) {
    if (!existing.has(column)) {
      db.exec(`ALTER TABLE provider_configs ADD COLUMN ${column} ${type}`);
    }
  }
}
