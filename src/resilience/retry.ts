/**
 * Retry with exponential backoff.
 *
 * Vendored (behavior-preserving) from `@repo/resilience`, with the global
 * logger replaced by an injectable `Logger` (defaults to no-op).
 */

import { DEFAULT_RETRY_CONFIG, type RetryConfig } from "./types.js";
import { calculateRetryDelay } from "./backoff.js";
import { noopLogger } from "../adapters/logging/noop-logger.js";

export async function withRetry<T>(
  fn: () => Promise<T>,
  config: RetryConfig = {},
): Promise<T> {
  const { shouldRetry, logger = noopLogger, ...rest } = config;
  const merged = { ...DEFAULT_RETRY_CONFIG, ...rest };
  let lastError: unknown;

  for (let attempt = 1; attempt <= merged.maxRetries + 1; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Stop immediately if the caller says this error is not retryable.
      if (shouldRetry && !shouldRetry(error)) break;
      if (attempt > merged.maxRetries) break;

      const delay = calculateRetryDelay(attempt, merged);
      logger.warn(
        `Attempt ${attempt} failed. Retrying in ${delay}ms...`,
        error instanceof Error ? error.message : String(error),
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
