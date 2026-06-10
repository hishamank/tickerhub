/**
 * Finnhub API response shapes (the subset this provider consumes).
 */

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
