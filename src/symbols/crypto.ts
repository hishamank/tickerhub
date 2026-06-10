/**
 * Crypto symbol → CoinGecko ID mapping.
 *
 * Static mapping from common crypto symbols to CoinGecko coin IDs, used for
 * fetching crypto prices. Vendored from the source monorepo's `@repo/markets`.
 */

import cryptoIdsMap from "./data/crypto-ids.json" with { type: "json" };

type CryptoSymbol = keyof typeof cryptoIdsMap;

/** Get the CoinGecko ID for a crypto symbol, or null if unmapped. */
export function getCoinGeckoId(symbol: string): string | null {
  const normalized = symbol.toUpperCase();
  return cryptoIdsMap[normalized as CryptoSymbol] ?? null;
}

/** True if the symbol is present in the CoinGecko mapping. */
export function isSupportedCryptoSymbol(symbol: string): boolean {
  return getCoinGeckoId(symbol) !== null;
}
