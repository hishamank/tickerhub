/**
 * Cache Module
 *
 * Exports SWR caching functionality. The SWR cache is constructed with an
 * injected Cache port (see `createAggregator`).
 */

export { SwrCache } from "./swr-cache.js";
export { generateCacheKey, parseCacheKey } from "./key-generator.js";
export { getTTL, setTTL, TTL_CONFIG } from "./ttl-config.js";
