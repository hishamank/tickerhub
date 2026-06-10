/**
 * Shared provider helpers as free functions, so fetch/mapping logic can be
 * extracted out of provider classes while still sharing validation and HTTP
 * error mapping. `BaseProvider` delegates its protected helpers to these.
 */

import { ProviderError, ProviderErrorCode } from "../types/provider.js";

/** Basic symbol-format validation. Throws ProviderError on invalid input. */
export function validateSymbol(symbol: string): void {
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

/** Convert an HTTP/network error into a ProviderError. Never returns. */
export function handleHttpError(error: unknown, context: string): never {
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
