/**
 * Provider Factory
 *
 * Creates market data provider instances on-demand with user credentials.
 * Each provider is created per-request, not cached.
 */

import type { MarketDataProvider } from "../types/provider.js";
import {
  YahooFinanceProvider,
  FinnhubProvider,
  AlphaVantageProvider,
  FMPProvider,
  PolygonProvider,
  TiingoProvider,
  TradierProvider,
  MarketstackProvider,
  CoinGeckoProvider,
  TwelveDataProvider,
  AlpacaProvider,
  NasdaqDataLinkProvider,
} from "./index.js";
import { getLogger } from "../logging/index.js";

const logger = getLogger("provider-factory", "packages/provider-aggregator");

export class ProviderFactory {
  /**
   * Create a provider instance by name with user credentials.
   *
   * Enabled/disabled filtering is the caller's responsibility — the aggregator
   * only iterates providers the registry reports as enabled.
   *
   * @param providerName - Name of the provider
   * @param credentials - User's API credentials (or null for keyless providers)
   * @returns Provider instance or null if cannot be created
   */
  static create(
    providerName: string,
    credentials: Record<string, string> | null,
  ): MarketDataProvider | null {
    try {
      switch (providerName) {
        case "yahoo_finance":
        case "yahoo-finance":
          return new YahooFinanceProvider(credentials);

        case "finnhub":
          return new FinnhubProvider(credentials);

        case "alpha_vantage":
        case "alpha-vantage":
          return new AlphaVantageProvider(credentials);

        case "fmp":
          return new FMPProvider(credentials);

        case "polygon":
          return new PolygonProvider(credentials);

        case "tiingo":
          return new TiingoProvider(credentials);

        case "tradier":
          return new TradierProvider(credentials);

        case "marketstack":
          return new MarketstackProvider(credentials);

        case "alpaca":
          return new AlpacaProvider(credentials);

        case "coingecko":
          return new CoinGeckoProvider(credentials);

        case "twelve_data":
        case "twelve-data":
          return new TwelveDataProvider(credentials);

        case "nasdaq-data-link":
        case "nasdaq_data_link":
          return new NasdaqDataLinkProvider(credentials);

        default:
          logger.warn(`Unknown provider: ${providerName}`);
          return null;
      }
    } catch (error) {
      logger.error(`Error creating provider ${providerName}:`, {
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      });
      return null;
    }
  }

  /**
   * Validate that a provider can be created with given credentials
   * @param providerName - Name of the provider
   * @param credentials - User's API credentials
   * @returns true if provider can be created
   */
  static canCreate(
    providerName: string,
    credentials: Record<string, string> | null,
  ): boolean {
    return this.create(providerName, credentials) !== null;
  }
}
