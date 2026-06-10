/**
 * International ticker → US ADR resolution.
 *
 * Resolves international tickers to their US-traded equivalents so holdings can
 * be priced through US market-data providers. Vendored from `@repo/markets`;
 * trimmed to the functions the aggregator uses.
 */

import mappingsData from "./data/ticker-mappings.json" with { type: "json" };
import {
  getCurrencyForSymbol,
  getExchangeForSymbol,
} from "./exchange-currency.js";
import type { TickerMapping, TickerResolution } from "./types.js";

/** Lookup table keyed by uppercase original ticker. */
const TICKER_MAPPINGS: Record<string, TickerMapping> = {};
for (const entry of mappingsData as TickerMapping[]) {
  TICKER_MAPPINGS[entry.original.toUpperCase()] = entry;
}

/**
 * Resolve a ticker to its US-traded equivalent. If the ticker has an ADR
 * mapping, returns the ADR symbol; otherwise returns the original unchanged.
 */
export function resolveTickerMapping(ticker: string): TickerResolution {
  const normalized = ticker.toUpperCase();
  const mapping = TICKER_MAPPINGS[normalized];

  if (mapping) {
    const currency = mapping.currency ?? getCurrencyForSymbol(normalized);
    return {
      original: normalized,
      resolved: mapping.adr,
      isMapped: true,
      mapping,
      currency,
      exchange: getExchangeForSymbol(normalized) ?? mapping.originalExchange,
    };
  }

  return {
    original: normalized,
    resolved: normalized,
    isMapped: false,
    currency: getCurrencyForSymbol(normalized),
    exchange: getExchangeForSymbol(normalized),
  };
}
