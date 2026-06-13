/**
 * FMP response-status handling and pure transforms to domain types.
 *
 * FMP returns 403 for endpoints not on the free plan; the provider degrades
 * gracefully (empty result) rather than throwing, so callers can fall back.
 */

import { getLogger } from "../logging/index.js";
import type {
  QuoteData,
  DividendData,
  EarningsData,
  RatingData,
  HistoricalPrice,
  CompanyProfile,
} from "../types/index.js";
import { ProviderError, ProviderErrorCode } from "../types/provider.js";
import type {
  FMPQuoteResponse,
  FMPDividend,
  FMPEarningsItem,
  FMPHistoricalItem,
  FMPProfile,
} from "./fmp-types.js";

/** Drop `undefined`/null/empty values so optional fields stay absent. */
function clean<T extends Record<string, unknown>>(obj: T): T {
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (v === undefined || v === null || v === "") delete obj[k];
  }
  return obj;
}

const logger = getLogger("fmp", "provider-aggregator/providers");

/**
 * Inspect a non-2xx FMP response. Throws for 429/401/unexpected statuses;
 * returns `true` for 403 (caller should degrade to an empty result). Returns
 * `false` when the response is OK.
 */
export function fmpForbiddenOrThrow(
  response: Response,
  label: string,
  symbol: string,
): boolean {
  if (response.ok) return false;

  if (response.status === 429) {
    throw new ProviderError(
      ProviderErrorCode.RATE_LIMIT_EXCEEDED,
      "FMP rate limit exceeded",
      true,
      3600, // daily limit → retry in ~1h
    );
  }
  if (response.status === 401) {
    throw new ProviderError(
      ProviderErrorCode.AUTHENTICATION_FAILED,
      "FMP authentication failed - check API key",
      false,
    );
  }
  if (response.status === 403) {
    logger.warn(
      `[fmp] 403 Forbidden for ${label} (paid plan may be required) for ${symbol}`,
    );
    return true;
  }
  throw new ProviderError(
    ProviderErrorCode.NETWORK_ERROR,
    `FMP API returned ${response.status}`,
    true,
  );
}

export function mapQuote(quote: FMPQuoteResponse, symbol: string): QuoteData {
  return {
    symbol,
    price: quote.price,
    open: quote.open,
    high: quote.dayHigh,
    low: quote.dayLow,
    previousClose: quote.previousClose,
    change: quote.change,
    changePercent: quote.changesPercentage,
    volume: quote.volume,
    timestamp: new Date(quote.timestamp * 1000),
    currency: "USD",
  };
}

export function mapDividends(
  historical: FMPDividend[],
  startDate?: Date,
  endDate?: Date,
): DividendData[] {
  let dividends = historical;
  if (startDate || endDate) {
    dividends = dividends.filter((div) => {
      const divDate = new Date(div.date);
      if (startDate && divDate < startDate) return false;
      if (endDate && divDate > endDate) return false;
      return true;
    });
  }
  return dividends.map((div) => ({
    exDate: new Date(div.date),
    amount: div.dividend,
    currency: "USD",
    paymentDate: div.paymentDate ? new Date(div.paymentDate) : undefined,
    recordDate: div.recordDate ? new Date(div.recordDate) : undefined,
  }));
}

export function mapEarnings(items: FMPEarningsItem[]): EarningsData[] {
  return items.map((item) => ({
    date: new Date(item.date),
    fiscalQuarter: `Q${item.quarter}`,
    fiscalYear: item.fiscalYear || new Date(item.date).getFullYear(),
    estimate: item.epsEstimate ?? undefined,
    actual: item.epsActual ?? undefined,
    revenueEstimate: item.revenueEstimated ?? undefined,
    revenueActual: item.revenue ?? undefined,
  }));
}

export function mapHistorical(items: FMPHistoricalItem[]): HistoricalPrice[] {
  return items.map((item) => ({
    date: item.date,
    open: item.open,
    high: item.high,
    low: item.low,
    close: item.close,
    volume: item.volume,
  }));
}

export function mapRatingToConsensus(rating: string): RatingData["consensus"] {
  const normalized = rating.toLowerCase();
  if (normalized.includes("strong buy")) return "strong_buy";
  if (normalized.includes("buy")) return "buy";
  if (normalized.includes("sell")) return "sell";
  return "hold";
}

/** Map an FMP `/profile/{symbol}` entry to a normalized CompanyProfile. */
export function mapFmpProfile(p: FMPProfile, symbol: string): CompanyProfile {
  const employees = p.fullTimeEmployees
    ? Number.parseInt(p.fullTimeEmployees, 10)
    : undefined;
  const address = [p.address, p.city, p.state].filter(Boolean).join(", ");
  return clean({
    symbol: (p.symbol ?? symbol).toUpperCase(),
    name: p.companyName,
    description: p.description,
    exchange: p.exchangeShortName ?? p.exchange,
    currency: p.currency,
    country: p.country,
    sector: p.sector,
    industry: p.industry,
    website: p.website,
    logo: p.image,
    ceo: p.ceo,
    phone: p.phone,
    address: address || undefined,
    ipoDate: p.ipoDate,
    marketCap: p.mktCap,
    employees: employees !== undefined && !Number.isNaN(employees) ? employees : undefined,
  }) as CompanyProfile;
}
