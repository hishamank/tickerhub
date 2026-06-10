/**
 * Exponential backoff with optional jitter.
 *
 * Vendored (behavior-preserving) from `@repo/resilience`.
 */

import { DEFAULT_RETRY_CONFIG, type RetryConfig } from "./types.js";

export function addJitter(delay: number, factor = 0.1): number {
  if (factor <= 0) return delay;
  const jitterAmount = delay * factor;
  const randomJitter = (Math.random() * 2 - 1) * jitterAmount;
  return Math.max(0, Math.floor(delay + randomJitter));
}

export function calculateRetryDelay(attempt: number, config: RetryConfig = {}): number {
  const { baseDelayMs, maxDelayMs, jitter, jitterFactor } = {
    ...DEFAULT_RETRY_CONFIG,
    ...config,
  };
  let delay = baseDelayMs * Math.pow(2, attempt - 1);
  delay = Math.min(delay, maxDelayMs);
  if (jitter) delay = addJitter(delay, jitterFactor);
  return delay;
}
