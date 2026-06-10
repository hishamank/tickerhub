/**
 * ADR Fallback and Currency Enrichment
 *
 * Handles international ticker → ADR mapping fallback when primary
 * provider lookups fail. Also enriches quote data with native currency
 * information for international stocks.
 */

import { Decimal } from "decimal.js";
import { getLogger } from "../logging/index.js";
import { resolveTickerMapping, needsFxConversion } from "../symbols/index.js";
import type { QuoteData } from "../types/index.js";

const logger = getLogger(
  "adr-fallback",
  "packages/provider-aggregator/aggregator",
);

/**
 * Enrich a quote with native currency info for international stocks.
 * Converts GBX (pence) to GBP for London-listed stocks.
 */
export function enrichWithCurrencyInfo(
  quote: QuoteData,
  originalSymbol: string,
): QuoteData {
  const resolution = resolveTickerMapping(originalSymbol);
  const nativeCurrency = resolution.currency;

  if (!needsFxConversion(nativeCurrency)) {
    return quote;
  }

  if (resolution.isMapped && quote.symbol === originalSymbol) {
    return { ...quote, nativeCurrency };
  }

  const quoteCurrency = quote.currency ?? nativeCurrency;
  if (quoteCurrency !== "USD" && needsFxConversion(quoteCurrency)) {
    let nativePrice = quote.price;

    if (
      originalSymbol.toUpperCase().endsWith(".L") &&
      quoteCurrency.toUpperCase() === "GBP"
    ) {
      nativePrice = new Decimal(nativePrice).div(100).toNumber();
    }

    return { ...quote, nativePrice, nativeCurrency: quoteCurrency };
  }

  return { ...quote, nativeCurrency };
}

/**
 * Execute a fetch with ADR ticker fallback.
 * If the primary lookup returns empty, tries the mapped ADR ticker.
 */
export async function executeWithAdrFallback<T>(
  symbol: string,
  userId: string,
  execute: (sym: string, uid: string) => Promise<T>,
  isEmpty: (result: T) => boolean,
  emptyValue: T,
): Promise<T> {
  try {
    const result = await execute(symbol, userId);
    if (result != null && !isEmpty(result)) {
      return result;
    }
  } catch (error) {
    logger.warn(`All providers failed for ${symbol}:`, error);
  }

  const mapping = resolveTickerMapping(symbol);
  if (mapping.isMapped && mapping.resolved !== symbol) {
    logger.info(`Trying ADR mapping: ${symbol} → ${mapping.resolved}`);
    try {
      const adrResult = await execute(mapping.resolved, userId);
      if (adrResult != null && !isEmpty(adrResult)) {
        return remapSymbol(adrResult, symbol);
      }
    } catch (error) {
      logger.warn(`ADR fallback failed for ${mapping.resolved}:`, error);
    }
  }

  logger.error(`All providers failed to fetch data for ${symbol}`);
  return emptyValue;
}

function remapSymbol<T>(data: T, originalSymbol: string): T {
  if (data && typeof data === "object" && "symbol" in data) {
    const resolution = resolveTickerMapping(originalSymbol);
    return {
      ...data,
      symbol: originalSymbol,
      currency: resolution.currency,
      exchange: resolution.exchange,
    } as T;
  }
  return data;
}
