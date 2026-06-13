/**
 * CryptoAggregator — the crypto asset-class namespace.
 *
 * Shares the ProviderQueryEngine with the equity aggregator (same
 * selection/fallback/rate-limit machinery) but exposes only crypto data types.
 */

import type {
  QuoteData,
  HistoricalPrice,
  CryptoMarket,
} from "../types/index.js";
import type { ProviderQueryEngine } from "./provider-query-engine.js";

export class CryptoAggregator {
  constructor(private readonly engine: ProviderQueryEngine) {}

  fetchQuote(
    symbol: string,
    userId: string = "system",
  ): Promise<QuoteData | null> {
    return this.engine.tryProviders<QuoteData | null>(
      "crypto_quote",
      symbol,
      userId,
      (p) => (p.fetchCryptoQuote ? (s) => p.fetchCryptoQuote!(s) : undefined),
    );
  }

  fetchHistorical(
    symbol: string,
    from: Date,
    to: Date,
    userId: string = "system",
  ): Promise<HistoricalPrice[]> {
    return this.engine.tryProvidersList<HistoricalPrice>(
      "crypto_historical",
      symbol,
      userId,
      (p) =>
        p.fetchCryptoHistorical
          ? (s) => p.fetchCryptoHistorical!(s, from, to)
          : undefined,
    );
  }

  fetchMarkets(
    limit: number = 50,
    userId: string = "system",
  ): Promise<CryptoMarket[]> {
    return this.engine.tryProvidersList<CryptoMarket>(
      "crypto_markets",
      "",
      userId,
      (p) => (p.fetchCryptoMarkets ? () => p.fetchCryptoMarkets!(limit) : undefined),
    );
  }
}
