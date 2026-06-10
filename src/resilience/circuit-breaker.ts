/**
 * Circuit breaker.
 *
 * Vendored (behavior-preserving) from `@repo/resilience`, with the global
 * logger replaced by an injectable `Logger` and the `StateError` dependency
 * replaced by a local `CircuitOpenError`.
 */

import {
  CircuitState,
  DEFAULT_CIRCUIT_BREAKER_CONFIG,
  type CircuitBreakerConfig,
} from "./types.js";
import { BaseError } from "../errors/base-error.js";
import { noopLogger } from "../adapters/logging/noop-logger.js";
import type { Logger } from "../ports/logger.js";

/** Thrown when a call is rejected because the breaker is OPEN. */
export class CircuitOpenError extends BaseError {
  constructor(name: string, context?: Record<string, unknown>) {
    super(`Circuit breaker "${name}" is OPEN`, {
      code: "CIRCUIT_OPEN",
      statusCode: 503,
      isOperational: true,
      ...(context && { context }),
    });
  }
}

type ResolvedConfig = Required<Omit<CircuitBreakerConfig, "logger">>;

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private lastFailureTime = 0;
  private readonly config: ResolvedConfig;
  private readonly logger: Logger;

  constructor(config: CircuitBreakerConfig = {}) {
    const { logger, ...rest } = config;
    this.config = { ...DEFAULT_CIRCUIT_BREAKER_CONFIG, name: "default", ...rest };
    this.logger = logger ?? noopLogger;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (this.shouldAttemptReset()) {
        this.transitionTo(CircuitState.HALF_OPEN);
      } else {
        throw new CircuitOpenError(this.config.name, { state: this.state });
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error);
      throw error;
    }
  }

  private shouldAttemptReset(): boolean {
    return Date.now() - this.lastFailureTime >= this.config.resetTimeoutMs;
  }

  private onSuccess(): void {
    if (this.state === CircuitState.HALF_OPEN) {
      this.transitionTo(CircuitState.CLOSED);
    }
    this.failureCount = 0;
  }

  private onFailure(error: unknown): void {
    try {
      if (!this.config.isFailure(error)) return;
    } catch {
      // If the filter throws, count the error (fail-safe).
    }
    this.failureCount++;
    this.lastFailureTime = Date.now();
    if (
      this.state === CircuitState.CLOSED &&
      this.failureCount >= this.config.failureThreshold
    ) {
      this.transitionTo(CircuitState.OPEN);
    } else if (this.state === CircuitState.HALF_OPEN) {
      this.transitionTo(CircuitState.OPEN);
    }
  }

  private transitionTo(newState: CircuitState): void {
    const oldState = this.state;
    this.state = newState;
    this.logger.info(
      `Circuit breaker "${this.config.name}" state changed: ${oldState} -> ${newState}`,
    );
  }

  getState(): CircuitState {
    return this.state;
  }
}
