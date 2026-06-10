/**
 * Resilience configuration types.
 *
 * Vendored (behavior-preserving) from the source monorepo's `@repo/resilience`,
 * with the global logger dependency replaced by an injectable `Logger`.
 */

import type { Logger } from "../ports/logger.js";

export interface RetryConfig {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitter?: boolean;
  jitterFactor?: number;
  /** Return false to skip retrying for a specific error. Defaults to retrying all errors. */
  shouldRetry?: (error: unknown) => boolean;
  /** Optional logger for retry diagnostics. Defaults to a no-op. */
  logger?: Logger;
}

export const DEFAULT_RETRY_CONFIG: Required<
  Omit<RetryConfig, "shouldRetry" | "logger">
> = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  jitter: true,
  jitterFactor: 0.1,
};

export enum CircuitState {
  CLOSED = "CLOSED",
  OPEN = "OPEN",
  HALF_OPEN = "HALF_OPEN",
}

export interface CircuitBreakerConfig {
  failureThreshold?: number;
  resetTimeoutMs?: number;
  name?: string;
  /**
   * Return true if the error should count as a circuit breaker failure.
   * Defaults to `() => true` (all errors count). Use this to exclude expected
   * errors (e.g. rate limits) from tripping the breaker.
   */
  isFailure?: (error: unknown) => boolean;
  /** Optional logger for state-transition diagnostics. Defaults to a no-op. */
  logger?: Logger;
}

export const DEFAULT_CIRCUIT_BREAKER_CONFIG: Required<
  Omit<CircuitBreakerConfig, "name" | "logger">
> = {
  failureThreshold: 5,
  resetTimeoutMs: 30000,
  isFailure: () => true,
};
