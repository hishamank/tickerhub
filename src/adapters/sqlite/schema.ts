/**
 * SQLite schema for the optional persistence adapters.
 *
 * Booleans are stored as 0/1 integers, timestamps as epoch milliseconds, and
 * `supported_data_types` as a JSON-encoded string array.
 */
export const SQLITE_SCHEMA = `
CREATE TABLE IF NOT EXISTS provider_configs (
  name TEXT PRIMARY KEY,
  provider_type TEXT NOT NULL,
  requires_key INTEGER NOT NULL,
  rate_limit_per_minute INTEGER,
  rate_limit_per_day INTEGER,
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
`;
