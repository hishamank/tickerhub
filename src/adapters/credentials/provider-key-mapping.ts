/**
 * Provider → environment-variable mapping for credential resolution.
 *
 * Maps each provider name (and its aliases) to the environment variable(s) that
 * hold its credentials. Keyless providers (Yahoo Finance, CoinGecko) are absent
 * and resolve to `null`.
 */

export interface ProviderEnvMapping {
  /** Env var holding the primary API key. */
  apiKey: string;
  /** Optional env var holding a secret (e.g. Alpaca). */
  apiSecret?: string;
}

/** Canonical mapping keyed by normalized provider name (lowercase, hyphenated). */
export const PROVIDER_ENV_MAPPING: Record<string, ProviderEnvMapping> = {
  finnhub: { apiKey: "FINNHUB_API_KEY" },
  fmp: { apiKey: "FMP_API_KEY" },
  "alpha-vantage": { apiKey: "ALPHA_VANTAGE_API_KEY" },
  polygon: { apiKey: "POLYGON_API_KEY" },
  tiingo: { apiKey: "TIINGO_API_KEY" },
  "twelve-data": { apiKey: "TWELVE_DATA_API_KEY" },
  marketstack: { apiKey: "MARKETSTACK_API_KEY" },
  tradier: { apiKey: "TRADIER_API_KEY" },
  alpaca: { apiKey: "ALPACA_API_KEY", apiSecret: "ALPACA_API_SECRET" },
  "nasdaq-data-link": { apiKey: "NASDAQ_DATA_LINK_API_KEY" },
};

/** Normalize a provider name to its canonical mapping key. */
export function normalizeProviderName(name: string): string {
  return name.toLowerCase().replace(/_/g, "-");
}
