/**
 * Aggregator Module
 *
 * Intelligent provider selection and failover for market data:
 * - Provider selection based on configured priorities
 * - Automatic fallback when providers fail
 * - Health monitoring integration
 * - Request coalescing & graceful degradation (via SWR cache)
 */

export {
  SmartAggregator,
  type SmartAggregatorDeps,
} from "./smart-aggregator.js";
export {
  enrichWithCurrencyInfo,
  executeWithAdrFallback,
} from "./adr-fallback.js";
