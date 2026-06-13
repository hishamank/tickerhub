/**
 * ConfigStore port.
 *
 * Supplies provider-configuration overrides that are merged on top of the
 * built-in defaults. The default `InMemoryConfigStore` returns no overrides
 * (built-in defaults only); a `SqliteConfigStore` is available from `/sqlite`.
 *
 * This is a plain data contract — no ORM types leak into the core.
 */
export interface ProviderConfigRecord {
  name: string;
  providerType: string;
  requiresKey: boolean;
  rateLimitPerMinute: number | null;
  rateLimitPerHour: number | null;
  rateLimitPerDay: number | null;
  rateLimitPerMonth: number | null;
  reliabilityScore: number;
  enabled: boolean;
  paidTier: boolean;
  supportedDataTypes: string[];
  priority: number;
}

export interface ConfigStore {
  /** Return all provider-configuration override rows. */
  getAllConfigs(): Promise<ProviderConfigRecord[]>;
}
