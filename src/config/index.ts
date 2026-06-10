/**
 * Config Module
 *
 * Exports provider configuration, priorities, and the provider registry.
 */

export {
  getProviderPriority,
  DEFAULT_PROVIDER_PRIORITIES,
  PROVIDER_RELIABILITY_SCORES,
  BUILTIN_PROVIDERS,
} from "./default-priorities.js";

export {
  ProviderRegistry,
  type ProviderMetadata,
} from "./provider-registry.js";
