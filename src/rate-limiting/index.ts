/**
 * Rate Limiting Module
 *
 * Exports the per-key rate-limit tracker used by the aggregator. The
 * authoritative per-provider limits live in `BUILTIN_PROVIDERS`
 * (config/default-priorities.ts), merged with ConfigStore overrides by the
 * ProviderRegistry — that is the single source of truth.
 */

export {
  RateLimitTracker,
  getRateLimitTracker,
  resetRateLimitTracker,
} from "./tracker.js";
