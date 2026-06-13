/**
 * CryptoService — the SWR-cached `service.crypto.*` namespace.
 */

import type { SwrCache } from "../cache/swr-cache.js";
import type { CryptoAggregator } from "../aggregator/crypto-aggregator.js";
import type {
  QuoteData,
  HistoricalPrice,
  CryptoMarket,
  MarketDataResponse,
} from "../types/index.js";

export class CryptoService {
  constructor(
    private readonly crypto: CryptoAggregator,
    private readonly cache: SwrCache,
  ) {}

  /** Get a crypto quote (SWR-cached). */
  async getQuote(
    symbol: string,
    userId: string = "system",
    options?: { forceRefresh?: boolean },
  ): Promise<MarketDataResponse<QuoteData | null>> {
    return this.cache.get(
      "getCryptoQuote",
      [symbol.toUpperCase()],
      () => this.crypto.fetchQuote(symbol, userId),
      options,
    );
  }

  /** Get crypto historical prices (SWR-cached). */
  async getHistorical(
    symbol: string,
    from: Date,
    to: Date,
    userId: string = "system",
    options?: { forceRefresh?: boolean },
  ): Promise<MarketDataResponse<HistoricalPrice[]>> {
    return this.cache.get(
      "getCryptoHistorical",
      [
        symbol.toUpperCase(),
        from.toISOString().split("T")[0]!,
        to.toISOString().split("T")[0]!,
      ],
      () => this.crypto.fetchHistorical(symbol, from, to, userId),
      options,
    );
  }

  /** Get ranked crypto markets (SWR-cached). */
  async getMarkets(
    limit: number = 50,
    userId: string = "system",
    options?: { forceRefresh?: boolean },
  ): Promise<MarketDataResponse<CryptoMarket[]>> {
    return this.cache.get(
      "getCryptoMarkets",
      [String(limit)],
      () => this.crypto.fetchMarkets(limit, userId),
      options,
    );
  }
}
