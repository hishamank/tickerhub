/**
 * SQLite adapters subpath entry (`tickerhub/sqlite`).
 *
 * Optional SQLite-backed implementations of the ConfigStore and
 * HealthMetricsStore ports. `better-sqlite3` is an optional peer dependency,
 * imported lazily by `openSqliteStores` so the core package stays
 * dependency-free. The store classes themselves take a Database instance, so
 * callers who manage their own connection can construct them directly.
 */

import type { Database } from "better-sqlite3";
import { SqliteConfigStore } from "./sqlite-config-store.js";
import { SqliteHealthStore } from "./sqlite-health-store.js";

export { SqliteConfigStore } from "./sqlite-config-store.js";
export { SqliteHealthStore } from "./sqlite-health-store.js";
export { SQLITE_SCHEMA } from "./schema.js";

export interface SqliteStores {
  db: Database;
  configStore: SqliteConfigStore;
  healthStore: SqliteHealthStore;
}

/**
 * Open a SQLite database and build both stores. Lazily imports `better-sqlite3`
 * (install it as a peer to use this). Pass `":memory:"` for an ephemeral DB.
 */
export async function openSqliteStores(
  filename: string,
): Promise<SqliteStores> {
  const { default: BetterSqlite3 } = await import("better-sqlite3");
  const db = new BetterSqlite3(filename);
  db.pragma("journal_mode = WAL");
  return {
    db,
    configStore: new SqliteConfigStore(db),
    healthStore: new SqliteHealthStore(db),
  };
}
