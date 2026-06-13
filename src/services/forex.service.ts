/**
 * ForexService — the SWR-cached `service.forex.*` namespace.
 */

import type { SwrCache } from "../cache/swr-cache.js";
import type { ForexAggregator } from "../aggregator/forex-aggregator.js";
import type {
  ForexRate,
  HistoricalPrice,
  MarketDataResponse,
} from "../types/index.js";

export class ForexService {
  constructor(
    private readonly forex: ForexAggregator,
    private readonly cache: SwrCache,
  ) {}

  /** Get a forex rate (SWR-cached). */
  async getRate(
    from: string,
    to: string,
    userId: string = "system",
    options?: { forceRefresh?: boolean },
  ): Promise<MarketDataResponse<ForexRate | null>> {
    return this.cache.get(
      "getForexRate",
      [from.toUpperCase(), to.toUpperCase()],
      () => this.forex.fetchRate(from, to, userId),
      options,
    );
  }

  /** Get forex historical prices (SWR-cached). */
  async getHistorical(
    from: string,
    to: string,
    start: Date,
    end: Date,
    userId: string = "system",
    options?: { forceRefresh?: boolean },
  ): Promise<MarketDataResponse<HistoricalPrice[]>> {
    return this.cache.get(
      "getForexHistorical",
      [
        `${from.toUpperCase()}/${to.toUpperCase()}`,
        start.toISOString().split("T")[0]!,
        end.toISOString().split("T")[0]!,
      ],
      () => this.forex.fetchHistorical(from, to, start, end, userId),
      options,
    );
  }
}
