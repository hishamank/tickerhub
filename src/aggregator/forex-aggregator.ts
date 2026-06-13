/**
 * ForexAggregator — the forex asset-class namespace.
 *
 * Shares the ProviderQueryEngine with the equity aggregator but exposes only
 * forex data types.
 */

import type { ForexRate, HistoricalPrice } from "../types/index.js";
import type { ProviderQueryEngine } from "./provider-query-engine.js";

export class ForexAggregator {
  constructor(private readonly engine: ProviderQueryEngine) {}

  fetchRate(
    from: string,
    to: string,
    userId: string = "system",
  ): Promise<ForexRate | null> {
    return this.engine.tryProviders<ForexRate | null>(
      "forex_rate",
      `${from}/${to}`,
      userId,
      (p) => (p.fetchForexRate ? () => p.fetchForexRate!(from, to) : undefined),
    );
  }

  fetchHistorical(
    from: string,
    to: string,
    start: Date,
    end: Date,
    userId: string = "system",
  ): Promise<HistoricalPrice[]> {
    return this.engine.tryProvidersList<HistoricalPrice>(
      "forex_historical",
      `${from}/${to}`,
      userId,
      (p) =>
        p.fetchForexHistorical
          ? () => p.fetchForexHistorical!(from, to, start, end)
          : undefined,
    );
  }
}
