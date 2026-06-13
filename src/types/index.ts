/**
 * Types Index
 *
 * Re-exports all types from the provider-aggregator package.
 */

// Provider types
export type {
  DataType,
  RateLimitConfig,
  ProviderStatus,
  HealthStatus,
  MarketDataProvider,
  MarketDataRequest,
  ResponseMetadata,
  MarketDataResponse,
  ProviderCapability,
} from './provider.js';

export { ProviderErrorCode, ProviderError } from './provider.js';

// Data types
export type {
  QuoteData,
  DividendData,
  EarningsData,
  EventData,
  RatingData,
  HistoricalPrice,
  OptionGreeks,
  OptionContract,
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
} from './data.js';

// Macro types
export type { MacroIndicatorData } from './macro.js';

// Cache types
export type {
  CacheEntry,
  SwrOptions,
  TTLConfig,
  CacheStats,
} from './cache.js';

// Config types
export type {
  ProviderConfig,
  ProviderPriorityConfig,
  ProviderReliabilityScores,
} from './config.js';
