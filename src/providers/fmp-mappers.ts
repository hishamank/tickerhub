/**
 * FMP response-status handling and pure transforms to domain types.
 *
 * FMP answers 402/403 for endpoints outside the caller's plan, including the
 * retired legacy paths. Those surface as non-retryable ENTITLEMENT_REQUIRED
 * errors carrying FMP's own message; the aggregator then falls back.
 */

import type {
  QuoteData,
  DividendData,
  EarningsData,
  RatingData,
  HistoricalPrice,
  CompanyProfile,
} from "../types/index.js";
import { ProviderError, ProviderErrorCode } from "../types/provider.js";
import { sanitizeSecrets } from "./provider-utils.js";
import type {
  FMPQuoteResponse,
  FMPDividend,
  FMPEarningsItem,
  FMPHistoricalItem,
  FMPProfile,
  FMPRating,
} from "./fmp-types.js";

/** Drop `undefined`/null/empty values so optional fields stay absent. */
function clean<T extends Record<string, unknown>>(obj: T): T {
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (v === undefined || v === null || v === "") delete obj[k];
  }
  return obj;
}

const ENTITLEMENT_TEXT =
  /legacy endpoint|restricted endpoint|premium|subscription|upgrade your plan|not available under/i;
const INVALID_KEY_TEXT = /invalid api ?key/i;
const RATE_LIMIT_TEXT = /limit reach/i;

/** FMP reports problems under one of these keys, on 2xx and non-2xx alike. */
function upstreamMessage(
  body: unknown,
  apiKey: string,
): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const { "Error Message": primary, message, error } = body as Record<
    string,
    unknown
  >;
  const text = primary ?? message ?? error;
  return typeof text === "string" && text
    ? sanitizeSecrets(text, [apiKey])
    : undefined;
}

const rateLimited = () =>
  new ProviderError(
    ProviderErrorCode.RATE_LIMIT_EXCEEDED,
    "FMP rate limit exceeded",
    true,
    3600, // daily limit → retry in ~1h
  );

const authFailed = () =>
  new ProviderError(
    ProviderErrorCode.AUTHENTICATION_FAILED,
    "FMP authentication failed - check API key",
    false,
  );

/** What a request was for, plus the secret its error text must not reveal. */
export interface FmpRequestContext {
  label: string;
  target: string;
  apiKey: string;
}

function entitlementRequired(
  { label, target }: FmpRequestContext,
  detail: string,
): ProviderError {
  const subject = target ? `${label} for ${target}` : label;
  return new ProviderError(
    ProviderErrorCode.ENTITLEMENT_REQUIRED,
    `FMP plan does not include ${subject}: ${detail}`,
    false,
  );
}

/** An error response's body is best-effort: it may be empty or not JSON. */
async function readBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

async function httpError(
  response: Response,
  context: FmpRequestContext,
): Promise<ProviderError> {
  const detail = upstreamMessage(await readBody(response), context.apiKey);

  if (response.status === 429) return rateLimited();
  if (response.status === 401) return authFailed();
  if (response.status === 402 || response.status === 403) {
    if (detail && INVALID_KEY_TEXT.test(detail)) return authFailed();
    return entitlementRequired(context, detail ?? `HTTP ${response.status}`);
  }
  return new ProviderError(
    ProviderErrorCode.NETWORK_ERROR,
    `FMP API returned ${response.status}`,
    true,
  );
}

/** Classify a 2xx body that is not the expected array of rows. */
function bodyError(body: unknown, context: FmpRequestContext): ProviderError {
  const detail = upstreamMessage(body, context.apiKey);
  if (!detail) {
    return new ProviderError(
      ProviderErrorCode.PROVIDER_ERROR,
      "Invalid response from FMP API",
      true,
    );
  }
  if (INVALID_KEY_TEXT.test(detail)) return authFailed();
  if (RATE_LIMIT_TEXT.test(detail)) return rateLimited();
  if (ENTITLEMENT_TEXT.test(detail)) {
    return entitlementRequired(context, detail);
  }
  return new ProviderError(
    ProviderErrorCode.SYMBOL_NOT_FOUND,
    `FMP ${context.label}: ${detail}`,
    false,
  );
}

/**
 * Turn an FMP response into its rows, throwing a typed ProviderError otherwise.
 * Every stable endpoint used here returns a flat JSON array. A denied or
 * malformed response is a failure, never an empty result, so callers fall back
 * and nothing mistakes it for "this symbol has no data".
 */
export async function parseFmpRows<T>(
  response: Response,
  context: FmpRequestContext,
): Promise<T[]> {
  if (!response.ok) throw await httpError(response, context);
  const body: unknown = await response.json();
  if (!Array.isArray(body)) throw bodyError(body, context);
  return body as T[];
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
    changePercent: quote.changePercentage,
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
    // The stable payload has no fiscal quarter; a report date does not imply one.
    fiscalQuarter: item.quarter ? `Q${item.quarter}` : "Unknown",
    // Without a reported year this is the report date's calendar year, which is
    // only an approximation of the fiscal year.
    fiscalYear: item.fiscalYear || new Date(item.date).getUTCFullYear(),
    estimate: item.epsEstimated ?? item.epsEstimate ?? undefined,
    actual: item.epsActual ?? undefined,
    revenueEstimate: item.revenueEstimated ?? undefined,
    revenueActual: item.revenueActual ?? item.revenue ?? undefined,
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

const CONSENSUS_BY_SCORE: RatingData["consensus"][] = [
  "strong_sell",
  "sell",
  "hold",
  "buy",
  "strong_buy",
];
const SCORE_BY_GRADE: Record<string, number> = { S: 5, A: 4, B: 3, C: 2, D: 1 };

/**
 * Map a `/stable/ratings-snapshot` row to a consensus. The snapshot reports a
 * 1–5 `overallScore` and a letter grade (S, A-, D+) rather than buy/sell text;
 * the score wins and the grade's letter is the fallback.
 */
export function mapRatingToConsensus(
  rating: FMPRating,
): RatingData["consensus"] {
  const score =
    rating.overallScore ?? SCORE_BY_GRADE[rating.rating.charAt(0).toUpperCase()];
  if (score === undefined) return "hold";
  const clamped = Math.min(5, Math.max(1, Math.round(score)));
  return CONSENSUS_BY_SCORE[clamped - 1]!;
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
    marketCap: p.marketCap ?? p.mktCap,
    employees: employees !== undefined && !Number.isNaN(employees) ? employees : undefined,
  }) as CompanyProfile;
}
