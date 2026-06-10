/**
 * Finnhub API response shapes (the subset this provider consumes) plus a small
 * envelope-unwrapping helper.
 */

/**
 * Unwrap an axios-style `{ data }` envelope, falling back to the value itself.
 * The finnhub-ts client returns responses in either shape depending on version.
 */
export function unwrapData<T>(response: unknown): T {
  if (response && typeof response === "object" && "data" in response) {
    const d = (response as { data: unknown }).data;
    if (d !== undefined && d !== null) return d as T;
  }
  return response as T;
}

export interface FinnhubQuote {
  c: number;
  o: number;
  h: number;
  l: number;
  pc: number;
  t: number;
}

export interface FinnhubDividend {
  date: string;
  amount: number;
  currency?: string;
  payDate?: string;
}

export interface FinnhubNews {
  headline: string;
  summary: string;
  url: string;
  datetime: number;
}

export interface FinnhubEarningsItem {
  date: string;
  quarter: number;
  year: number;
  epsEstimate?: number | null;
  epsActual?: number | null;
  revenueEstimate?: number | null;
  revenueActual?: number | null;
}

export interface FinnhubEarningsResponse {
  earningsCalendar?: FinnhubEarningsItem[];
}

export interface FinnhubRecommendation {
  strongBuy: number;
  buy: number;
  hold: number;
  sell: number;
  strongSell: number;
}

export interface FinnhubPriceTarget {
  targetMean?: number;
  targetHigh?: number;
  targetLow?: number;
}

export interface FinnhubCandles {
  s: string;
  t: number[];
  o: number[];
  h: number[];
  l: number[];
  c: number[];
  v: number[];
}
