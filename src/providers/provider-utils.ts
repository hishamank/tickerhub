/**
 * Shared provider helpers as free functions, so fetch/mapping logic can be
 * extracted out of provider classes while still sharing validation and HTTP
 * error mapping. `BaseProvider` delegates its protected helpers to these.
 */

import { ProviderError, ProviderErrorCode } from "../types/provider.js";

/**
 * Basic symbol-format validation. Throws ProviderError on invalid input.
 *
 * The charset covers the symbol styles providers actually use: plain US
 * tickers (AAPL), exchange-suffixed internationals (NOVO-B.CO, DFM.AE),
 * Yahoo-style indices and FX/futures (^GSPC, ^VIX, AED=X, GC=F), and
 * crypto pair forms (BTC-USD). 15 characters is the sane ceiling across
 * those styles.
 */
const SYMBOL_PATTERN = /^[A-Z0-9.\-=^]+$/i;
const PAIR_SYMBOL_PATTERN = /^[A-Z0-9./=^-]+$/i;
const MAX_SYMBOL_LENGTH = 15;

export function validateSymbol(
  symbol: string,
  options: { allowSlash?: boolean } = {},
): void {
  if (!symbol || symbol.trim().length === 0) {
    throw new ProviderError(
      ProviderErrorCode.INVALID_REQUEST,
      "Symbol cannot be empty",
      false,
    );
  }
  if (symbol.length > MAX_SYMBOL_LENGTH) {
    throw new ProviderError(
      ProviderErrorCode.INVALID_REQUEST,
      `Symbol too long (max ${MAX_SYMBOL_LENGTH} characters)`,
      false,
    );
  }
  const pattern = options.allowSlash ? PAIR_SYMBOL_PATTERN : SYMBOL_PATTERN;
  if (!pattern.test(symbol)) {
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
