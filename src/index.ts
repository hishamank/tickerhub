/**
 * tickerhub
 *
 * Provider-agnostic market data aggregation with SWR caching, health
 * monitoring, rate limiting, and pluggable credential / cache / storage
 * adapters.
 *
 * Quick start:
 * ```ts
 * import { createAggregator } from "tickerhub";
 * const { service } = createAggregator(); // zero-config: in-memory + env keys
 * const quote = await service.getQuote("AAPL");
 * ```
 */

export const VERSION = "0.1.0";

// === Composition root ===
export {
  createAggregator,
  type CreateAggregatorOptions,
  type Aggregator,
} from "./factory.js";

// === Service & aggregator ===
export { ProviderAggregatorService } from "./services/provider-aggregator.service.js";
export {
  SmartAggregator,
  type SmartAggregatorDeps,
} from "./aggregator/smart-aggregator.js";
export {
  enrichWithCurrencyInfo,
  executeWithAdrFallback,
} from "./aggregator/adr-fallback.js";

// === Ports (interfaces) ===
export type {
  Logger,
  Cache,
  CredentialProvider,
  ProviderCredentials,
  ConfigStore,
  ProviderConfigRecord,
  HealthMetricsStore,
  HealthMetricRecord,
} from "./ports/index.js";

// === Default adapters ===
export {
  ConsoleLogger,
  createConsoleLogger,
  NoopLogger,
  noopLogger,
  InMemoryCache,
  EnvCredentialProvider,
  type EnvRecord,
  ConfigCredentialProvider,
  PROVIDER_ENV_MAPPING,
  normalizeProviderName,
  type ProviderEnvMapping,
  InMemoryConfigStore,
  InMemoryHealthStore,
} from "./adapters/index.js";

// === Logging seam ===
export {
  getLogger,
  setLoggerFactory,
  resetLoggerFactory,
  type LoggerFactory,
} from "./logging/index.js";

// === Cache ===
export { SwrCache } from "./cache/swr-cache.js";
export { generateCacheKey, parseCacheKey } from "./cache/key-generator.js";
export { getTTL, setTTL, TTL_CONFIG } from "./cache/ttl-config.js";

// === Providers ===
export {
  BaseProvider,
  YahooFinanceProvider,
  FinnhubProvider,
  FMPProvider,
  PolygonProvider,
  AlphaVantageProvider,
  TiingoProvider,
  TwelveDataProvider,
  MarketstackProvider,
  AlpacaProvider,
  NasdaqDataLinkProvider,
  CoinGeckoProvider,
  TradierProvider,
} from "./providers/index.js";
export { ProviderFactory } from "./providers/provider-factory.js";

// === Config / registry ===
export {
  ProviderRegistry,
  type ProviderMetadata,
} from "./config/provider-registry.js";
export {
  getProviderPriority,
  DEFAULT_PROVIDER_PRIORITIES,
  PROVIDER_RELIABILITY_SCORES,
  BUILTIN_PROVIDERS,
} from "./config/default-priorities.js";

// === Health ===
export {
  HealthMonitor,
  type HealthMetrics,
  type RequestResult,
} from "./health/health-monitor.js";
export {
  HealthMetricsQuery,
  type ProviderHealthMetrics,
  type ProviderRateLimitStatus,
  type ProviderErrorInfo,
} from "./health/health-metrics-query.js";
export {
  FailureDetector,
  DEFAULT_THRESHOLDS,
  type FailureThresholds,
} from "./health/failure-detector.js";
export {
  RecoveryManager,
  DEFAULT_RECOVERY_CONFIG,
  type DisabledProvider,
  type RecoveryConfig,
} from "./health/recovery-manager.js";
export { flushHealthMetrics } from "./health/flush.js";
export { ProviderHealthRepository } from "./repositories/provider-health-repository.js";

// === Rate limiting ===
export {
  RateLimitTracker,
  getRateLimitTracker,
  resetRateLimitTracker,
} from "./rate-limiting/tracker.js";
export {
  getRateLimitConfig,
  PROVIDER_RATE_LIMITS,
} from "./rate-limiting/rate-limit-config.js";

// === Resilience ===
export {
  withRetry,
  CircuitBreaker,
  CircuitOpenError,
  CircuitState,
  type RetryConfig,
  type CircuitBreakerConfig,
} from "./resilience/index.js";

// === Symbols ===
export {
  getCoinGeckoId,
  isSupportedCryptoSymbol,
  resolveTickerMapping,
  needsFxConversion,
  type TickerMapping,
  type TickerResolution,
} from "./symbols/index.js";

// === Errors ===
export {
  BaseError,
  ValidationError,
  ConfigurationError,
  AggregatorError,
} from "./errors/index.js";

// === Types ===
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
  QuoteData,
  DividendData,
  EarningsData,
  EventData,
  RatingData,
  HistoricalPrice,
  OptionGreeks,
  OptionContract,
  OptionChain,
  MacroIndicatorData,
  CacheEntry,
  SwrOptions,
  TTLConfig,
  CacheStats,
  ProviderConfig,
  ProviderPriorityConfig,
  ProviderReliabilityScores,
} from "./types/index.js";
export { ProviderErrorCode, ProviderError } from "./types/provider.js";
export { MacroIndicatorDataSchema } from "./types/macro.js";
