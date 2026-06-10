/**
 * Twelve Data API response types and error handling helpers.
 *
 * Extracted from twelve-data.ts to keep files under the 300-line limit.
 */

import { getLogger } from "../logging/index.js";
import { ProviderError, ProviderErrorCode } from "../types/provider.js";

const logger = getLogger(
  "twelve-data",
  "packages/provider-aggregator/src/providers/twelve-data-types.ts",
);

/** Twelve Data quote endpoint response shape */
export interface TwelveDataQuoteResponse {
  symbol: string;
  name: string;
  exchange: string;
  currency: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  previous_close: string;
  change: string;
  percent_change: string;
  /** Epoch seconds — present in most responses */
  timestamp?: number;
  /** ISO date string — some responses use this instead of timestamp */
  datetime?: string;
}

/** Twelve Data error response shape (can arrive with HTTP 200) */
export interface TwelveDataErrorResponse {
  code: number;
  message: string;
  status: string;
}

/** Twelve Data time_series response shape */
export interface TwelveDataTimeSeriesResponse {
  meta?: {
    symbol: string;
    interval: string;
    currency: string;
  };
  values?: Array<{
    datetime: string;
    open: string;
    high: string;
    low: string;
    close: string;
    volume: string;
  }>;
  status?: string;
  code?: number;
  message?: string;
}

/**
 * Handle non-OK HTTP status codes from Twelve Data.
 */
export function handleHttpStatus(status: number, symbol: string): never {
  if (status === 429) {
    throw new ProviderError(
      ProviderErrorCode.RATE_LIMIT_EXCEEDED,
      "Twelve Data rate limit exceeded",
      true,
      60,
    );
  }

  if (status === 401 || status === 403) {
    throw new ProviderError(
      ProviderErrorCode.AUTHENTICATION_FAILED,
      "Twelve Data authentication failed — check API key",
      false,
    );
  }

  if (status === 404) {
    throw new ProviderError(
      ProviderErrorCode.SYMBOL_NOT_FOUND,
      `Symbol ${symbol} not found on Twelve Data`,
      false,
    );
  }

  throw new ProviderError(
    ProviderErrorCode.NETWORK_ERROR,
    `Twelve Data API returned ${status}`,
    true,
  );
}

/**
 * Handle Twelve Data error responses that arrive with HTTP 200.
 * Common codes: 400 (bad request), 401 (unauthorized), 429 (rate limit).
 */
export function handleApiError(
  error: TwelveDataErrorResponse,
  symbol: string,
): never {
  logger.warn(`[twelve-data] API error for ${symbol}:`, {
    code: error.code,
    message: error.message,
  });

  if (error.code === 429) {
    throw new ProviderError(
      ProviderErrorCode.RATE_LIMIT_EXCEEDED,
      `Twelve Data rate limit: ${error.message}`,
      true,
      60,
    );
  }

  if (error.code === 401) {
    throw new ProviderError(
      ProviderErrorCode.AUTHENTICATION_FAILED,
      `Twelve Data auth error: ${error.message}`,
      false,
    );
  }

  if (error.code === 400 || error.code === 404) {
    throw new ProviderError(
      ProviderErrorCode.SYMBOL_NOT_FOUND,
      `Twelve Data: ${error.message}`,
      false,
    );
  }

  throw new ProviderError(
    ProviderErrorCode.PROVIDER_ERROR,
    `Twelve Data error (${error.code}): ${error.message}`,
    true,
  );
}
