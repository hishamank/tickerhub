/**
 * Concrete error classes for the aggregator.
 *
 * `ValidationError` and `ConfigurationError` are vendored (behavior-preserving)
 * from the source monorepo's `@repo/errors`. `AggregatorError` is a generic
 * operational error for failures that don't fit a more specific class.
 *
 * Note: `ProviderError` (with its `ProviderErrorCode` enum) lives in
 * `types/provider.ts` alongside the provider contract it belongs to.
 */

import { BaseError } from "./base-error.js";

/** Input data failed validation rules. */
export class ValidationError extends BaseError {
  constructor(message = "Validation failed", context?: Record<string, unknown>) {
    super(message, {
      code: "VALIDATION_ERROR",
      statusCode: 400,
      isOperational: true,
      ...(context && { context }),
    });
  }
}

/** System misconfiguration detected (a programming error, not operational). */
export class ConfigurationError extends BaseError {
  constructor(
    message = "Configuration error",
    context?: Record<string, unknown>,
    cause?: Error,
  ) {
    super(message, {
      code: "CONFIGURATION_ERROR",
      statusCode: 500,
      isOperational: false,
      ...(context && { context }),
      ...(cause && { cause }),
    });
  }
}

/** Generic operational aggregator error. */
export class AggregatorError extends BaseError {
  constructor(
    message = "Aggregator error",
    context?: Record<string, unknown>,
    cause?: Error,
  ) {
    super(message, {
      code: "AGGREGATOR_ERROR",
      statusCode: 500,
      isOperational: true,
      ...(context && { context }),
      ...(cause && { cause }),
    });
  }
}
