/**
 * SqliteConfigStore — SQLite-backed ConfigStore adapter.
 *
 * Reads provider-configuration override rows from a `provider_configs` table.
 * Accepts a `better-sqlite3` Database instance (the optional peer dependency),
 * so the core package never imports it directly.
 */

import type { Database } from "better-sqlite3";
import type {
  ConfigStore,
  ProviderConfigRecord,
} from "../../ports/config-store.js";
import { ensureSchema } from "./schema.js";

interface ConfigRow {
  name: string;
  provider_type: string;
  requires_key: number;
  rate_limit_per_minute: number | null;
  rate_limit_per_hour: number | null;
  rate_limit_per_day: number | null;
  rate_limit_per_month: number | null;
  reliability_score: number;
  enabled: number;
  paid_tier: number;
  supported_data_types: string;
  priority: number;
}

export class SqliteConfigStore implements ConfigStore {
  constructor(private readonly db: Database) {
    ensureSchema(this.db);
  }

  async getAllConfigs(): Promise<ProviderConfigRecord[]> {
    const rows = this.db
      .prepare("SELECT * FROM provider_configs")
      .all() as ConfigRow[];

    return rows.map((row) => ({
      name: row.name,
      providerType: row.provider_type,
      requiresKey: row.requires_key === 1,
      rateLimitPerMinute: row.rate_limit_per_minute,
      rateLimitPerHour: row.rate_limit_per_hour,
      rateLimitPerDay: row.rate_limit_per_day,
      rateLimitPerMonth: row.rate_limit_per_month,
      reliabilityScore: row.reliability_score,
      enabled: row.enabled === 1,
      paidTier: row.paid_tier === 1,
      supportedDataTypes: JSON.parse(row.supported_data_types) as string[],
      priority: row.priority,
    }));
  }

  /** Insert or replace a provider configuration row (admin helper). */
  upsertConfig(config: ProviderConfigRecord): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO provider_configs
         (name, provider_type, requires_key, rate_limit_per_minute,
          rate_limit_per_hour, rate_limit_per_day, rate_limit_per_month,
          reliability_score, enabled, paid_tier, supported_data_types, priority)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        config.name,
        config.providerType,
        config.requiresKey ? 1 : 0,
        config.rateLimitPerMinute,
        config.rateLimitPerHour,
        config.rateLimitPerDay,
        config.rateLimitPerMonth,
        config.reliabilityScore,
        config.enabled ? 1 : 0,
        config.paidTier ? 1 : 0,
        JSON.stringify(config.supportedDataTypes),
        config.priority,
      );
  }
}
