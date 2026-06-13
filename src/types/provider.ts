/**
 * Provider Types
 *
 * Defines the standard interface that all market data providers must implement,
 * along with common types for provider configuration, errors, and responses.
 */

/**
 * Data types supported by the market data system
 */
export type DataType =
  | "prices"
  | "dividends"
  | "earnings"
  | "events"
  | "ratings"
  | "options"
  | "macro"
  | "profile"
  | "news"
  | "ipo"
  | "search"
  | "insider"
  | "technicals"
  | "movers"
  | "crypto_quote"
  | "crypto_historical"
  | "crypto_markets"
  | "forex_rate"
  | "forex_historical";

/**
 * Provider error codes for standardized error handling
 */
export enum ProviderErrorCode {
  RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED",
  SYMBOL_NOT_FOUND = "SYMBOL_NOT_FOUND",
  AUTHENTICATION_FAILED = "AUTHENTICATION_FAILED",
  NETWORK_ERROR = "NETWORK_ERROR",
  TIMEOUT = "TIMEOUT",
  INVALID_REQUEST = "INVALID_REQUEST",
  PROVIDER_ERROR = "PROVIDER_ERROR",
}

/**
 * Custom error class for provider-specific errors
 */
export class ProviderError extends Error {
  constructor(
    public readonly code: ProviderErrorCode,
    message: string,
    public readonly retryable: boolean = false,
    public readonly retryAfter?: number, // seconds to wait before retrying
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

/**
 * Rate limit configuration for a provider
 */
export interface RateLimitConfig {
  requestsPerMinute?: number | null;
  requestsPerHour?: number | null;
  requestsPerDay?: number | null;
  burstLimit?: number | null;
  monthlyLimit?: number | null;
}

/**
 * Provider health status
 */
export type ProviderStatus = "enabled" | "disabled" | "degraded";

/**
 * Provider health metrics
 */
export interface HealthStatus {
  provider: string;
  status: ProviderStatus;
  successRate: number; // 0.0 - 1.0
  avgLatencyMs: number;
  consecutiveFailures: number;
  lastCheckedAt: Date;
  disabledUntil?: Date;
}

/**
 * Base interface that all market data providers must implement
 */
export interface MarketDataProvider {
  /** Unique provider name */
  readonly name: string;

  /** Data types this provider supports */
  readonly supportedDataTypes: DataType[];

  /** Rate limit configuration */
  readonly rateLimit: RateLimitConfig;

  /**
   * Fetch current stock quote (required for all providers)
   * Returns null if quote cannot be fetched (e.g., due to API errors)
   */
  fetchQuote(symbol: string): Promise<QuoteData | null>;

  /**
   * Fetch dividend history (optional)
   */
  fetchDividends?(
    symbol: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<DividendData[]>;

  /**
   * Fetch earnings dates (optional)
   */
  fetchEarnings?(symbol: string): Promise<EarningsData[]>;

  /**
   * Fetch corporate events (optional)
   */
  fetchEvents?(symbol: string): Promise<EventData[]>;

  /**
   * Fetch analyst ratings (optional)
   */
  fetchRatings?(symbol: string): Promise<RatingData | null>;

  /**
   * Fetch historical prices (optional)
   */
  fetchHistoricalPrices?(
    symbol: string,
    from: Date,
    to: Date,
  ): Promise<HistoricalPrice[]>;

  /**
   * Fetch macroeconomic indicator data (optional)
   */
  fetchMacroIndicator?(indicator: string): Promise<MacroIndicatorData | null>;

  /**
   * Fetch option chain for an underlying and expiration date (optional)
   */
  fetchOptionChain?(
    symbol: string,
    expirationDate: Date,
  ): Promise<OptionChain | null>;

  /**
   * Fetch company profile / fundamentals snapshot (optional)
   */
  fetchProfile?(symbol: string): Promise<CompanyProfile | null>;

  /**
   * Fetch recent company news (optional)
   */
  fetchNews?(symbol: string): Promise<NewsArticle[]>;

  /**
   * Fetch the IPO calendar (optional). `symbol` is ignored by most providers.
   */
  fetchIpoCalendar?(symbol?: string): Promise<IpoEvent[]>;

  /**
   * Search for matching symbols (optional). `query` may be a ticker or name.
   */
  searchSymbols?(query: string): Promise<SymbolSearchResult[]>;

  /**
   * Fetch insider transactions (optional)
   */
  fetchInsiderTransactions?(symbol: string): Promise<InsiderTransaction[]>;

  /**
   * Fetch a technical-indicator series (optional)
   */
  fetchTechnicalIndicator?(
    symbol: string,
    indicator: string,
    interval?: string,
  ): Promise<TechnicalIndicator | null>;

  /**
   * Fetch market movers — gainers/losers/most-active (optional)
   */
  fetchMarketMovers?(
    direction: "gainers" | "losers" | "actives",
  ): Promise<MarketMover[]>;

  // ── Crypto namespace ───────────────────────────────────────────────
  /** Fetch a crypto quote (optional) */
  fetchCryptoQuote?(symbol: string): Promise<QuoteData | null>;
  /** Fetch crypto historical prices (optional) */
  fetchCryptoHistorical?(
    symbol: string,
    from: Date,
    to: Date,
  ): Promise<HistoricalPrice[]>;
  /** Fetch ranked crypto markets (optional) */
  fetchCryptoMarkets?(limit?: number): Promise<CryptoMarket[]>;

  // ── Forex namespace ────────────────────────────────────────────────
  /** Fetch a forex rate (optional) */
  fetchForexRate?(from: string, to: string): Promise<ForexRate | null>;
  /** Fetch forex historical prices (optional) */
  fetchForexHistorical?(
    from: string,
    to: string,
    start: Date,
    end: Date,
  ): Promise<HistoricalPrice[]>;

  /**
   * Health check (optional, defaults to simple ping)
   */
  healthCheck?(): Promise<boolean>;
}

/**
 * Market data request parameters
 */
export interface MarketDataRequest {
  dataType: DataType;
  symbol: string;
  forceRefresh?: boolean;
  timeRange?: {
    start: Date;
    end: Date;
  };
}

/**
 * Response metadata included with all market data responses.
 *
 * `source` is the unambiguous discriminator: `"cache"` when served from the SWR
 * cache, `"provider"` when freshly aggregated. `provider` is a human-readable
 * label of the serving layer (`"cache"` / `"aggregator"`); prefer `source` for
 * programmatic checks. `cached`/`stale` describe the cache entry's freshness.
 */
export interface ResponseMetadata {
  source: "cache" | "provider";
  provider: string;
  cached: boolean;
  stale: boolean;
  retrievedAt: Date;
  latencyMs: number;
  warnings?: string[];
}

/**
 * Market data response wrapper
 */
export interface MarketDataResponse<T> {
  data: T;
  metadata: ResponseMetadata;
}

/**
 * Provider capability information
 */
export interface ProviderCapability {
  dataType: DataType;
  providers: Array<{
    name: string;
    reliability: number;
    priority: number;
    enabled: boolean;
  }>;
}

// Import data types (forward reference - will be defined in data.ts)
import type {
  QuoteData,
  DividendData,
  EarningsData,
  EventData,
  RatingData,
  HistoricalPrice,
  OptionChain,
  CompanyProfile,
  NewsArticle,
  IpoEvent,
  SymbolSearchResult,
  InsiderTransaction,
  TechnicalIndicator,
  MarketMover,
  CryptoMarket,
  ForexRate,
} from "./data.js";

import type { MacroIndicatorData } from "./macro.js";
