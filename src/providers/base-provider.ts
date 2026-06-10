/**
 * Base Provider Abstract Class
 *
 * Abstract base that all market data providers extend. Provides shared helpers
 * (symbol validation, HTTP error mapping, a default health check) and enforces
 * the `MarketDataProvider` contract.
 *
 * Capability model: a provider advertises what it supports via
 * `supportedDataTypes`, and implements ONLY the optional fetch methods it
 * actually supports. The base class intentionally does NOT provide throwing
 * stubs for the optional methods — so a missing method is genuinely absent
 * (`typeof provider.fetchX === "function"` is meaningful), and the aggregator
 * never dispatches to an unsupported capability.
 */

import type {
  MarketDataProvider,
  QuoteData,
  DataType,
  RateLimitConfig,
} from "../types/index.js";
import { ProviderError, ProviderErrorCode } from "../types/provider.js";

export abstract class BaseProvider implements MarketDataProvider {
  abstract readonly name: string;
  abstract readonly supportedDataTypes: DataType[];
  abstract readonly rateLimit: RateLimitConfig;

  /**
   * Required: fetch current stock quote.
   * Returns null if the quote cannot be fetched (e.g. 403 Forbidden).
   */
  abstract fetchQuote(symbol: string): Promise<QuoteData | null>;

  /**
   * Optional: health check. Default returns true; providers may override.
   */
  async healthCheck(): Promise<boolean> {
    return true;
  }

  /** Helper: check if provider supports a specific data type. */
  supportsDataType(dataType: DataType): boolean {
    return this.supportedDataTypes.includes(dataType);
  }

  /** Helper: validate symbol format (basic validation). */
  protected validateSymbol(symbol: string): void {
    if (!symbol || symbol.trim().length === 0) {
      throw new ProviderError(
        ProviderErrorCode.INVALID_REQUEST,
        "Symbol cannot be empty",
        false,
      );
    }

    if (symbol.length > 10) {
      throw new ProviderError(
        ProviderErrorCode.INVALID_REQUEST,
        "Symbol too long (max 10 characters)",
        false,
      );
    }

    if (!/^[A-Z0-9.-]+$/i.test(symbol)) {
      throw new ProviderError(
        ProviderErrorCode.INVALID_REQUEST,
        "Symbol contains invalid characters",
        false,
      );
    }
  }

  /** Helper: convert an HTTP/network error into a ProviderError. */
  protected handleHttpError(error: unknown, context: string): never {
    if (error instanceof ProviderError) {
      throw error;
    }

    if (error instanceof Error) {
      if (
        error.message.includes("ECONNREFUSED") ||
        error.message.includes("ETIMEDOUT")
      ) {
        throw new ProviderError(
          ProviderErrorCode.NETWORK_ERROR,
          `Network error in ${context}: ${error.message}`,
          true,
        );
      }

      if (error.message.includes("timeout")) {
        throw new ProviderError(
          ProviderErrorCode.TIMEOUT,
          `Timeout in ${context}: ${error.message}`,
          true,
        );
      }

      throw new ProviderError(
        ProviderErrorCode.PROVIDER_ERROR,
        `Error in ${context}: ${error.message}`,
        true,
      );
    }

    throw new ProviderError(
      ProviderErrorCode.PROVIDER_ERROR,
      `Unknown error in ${context}`,
      true,
    );
  }
}
