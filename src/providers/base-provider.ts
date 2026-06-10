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
import {
  validateSymbol as validateSymbolUtil,
  handleHttpError as handleHttpErrorUtil,
} from "./provider-utils.js";

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
    validateSymbolUtil(symbol);
  }

  /** Helper: convert an HTTP/network error into a ProviderError. */
  protected handleHttpError(error: unknown, context: string): never {
    handleHttpErrorUtil(error, context);
  }
}
