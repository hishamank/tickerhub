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

/** True for a plan denial: valid credentials, data outside the subscription. */
export function isEntitlementDenied(error: unknown): boolean {
  return (
    error instanceof ProviderError &&
    error.code === ProviderErrorCode.ENTITLEMENT_REQUIRED
  );
}

const SECRET_QUERY_PARAM =
  /\b(api[_-]?key|token|access[_-]?key|secret)=[^&\s"'<>]+/gi;

/**
 * Remove credentials from text bound for errors, logs or health records:
 * key-bearing query parameters, plus any literal `secrets` an upstream echoed.
 */
export function sanitizeSecrets(
  text: string,
  secrets: readonly string[] = [],
): string {
  let sanitized = text.replace(SECRET_QUERY_PARAM, "$1=[REDACTED]");
  for (const secret of secrets) {
    if (secret) sanitized = sanitized.split(secret).join("[REDACTED]");
  }
  return sanitized;
}

const MAX_CAUSE_DEPTH = 3;

/**
 * A log-safe summary of a caught value: sanitized name, message and causes
 * only. The raw object must not be logged, as its other fields can hold keys.
 */
export function describeCaughtError(
  error: unknown,
  secrets: readonly string[] = [],
): string {
  const parts: string[] = [];
  let current = error;
  while (current !== undefined && parts.length <= MAX_CAUSE_DEPTH) {
    parts.push(
      current instanceof Error
        ? `${current.name}: ${current.message}`
        : String(current),
    );
    current = current instanceof Error ? current.cause : undefined;
  }
  return sanitizeSecrets(parts.join(" <- "), secrets);
}

/** Convert an HTTP/network error into a ProviderError. Never returns. */
export function handleHttpError(
  error: unknown,
  context: string,
  secrets: readonly string[] = [],
): never {
  if (error instanceof ProviderError) {
    throw error;
  }

  if (error instanceof Error) {
    const message = sanitizeSecrets(error.message, secrets);
    if (message.includes("ECONNREFUSED") || message.includes("ETIMEDOUT")) {
      throw new ProviderError(
        ProviderErrorCode.NETWORK_ERROR,
        `Network error in ${context}: ${message}`,
        true,
      );
    }
    if (message.includes("timeout")) {
      throw new ProviderError(
        ProviderErrorCode.TIMEOUT,
        `Timeout in ${context}: ${message}`,
        true,
      );
    }
    throw new ProviderError(
      ProviderErrorCode.PROVIDER_ERROR,
      `Error in ${context}: ${message}`,
      true,
    );
  }

  throw new ProviderError(
    ProviderErrorCode.PROVIDER_ERROR,
    `Unknown error in ${context}`,
    true,
  );
}
