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
  image?: string;
  source?: string;
}

export interface FinnhubIpoItem {
  date: string;
  exchange?: string;
  name?: string;
  numberOfShares?: number;
  price?: string;
  status?: string;
  symbol?: string;
}

export interface FinnhubIpoResponse {
  ipoCalendar?: FinnhubIpoItem[];
}

export interface FinnhubSearchItem {
  description?: string;
  displaySymbol?: string;
  symbol: string;
  type?: string;
}

export interface FinnhubSearchResponse {
  count?: number;
  result?: FinnhubSearchItem[];
}

export interface FinnhubInsiderItem {
  name?: string;
  share?: number;
  change?: number;
  filingDate?: string;
  transactionDate?: string;
  transactionPrice?: number;
  transactionCode?: string;
}

export interface FinnhubInsiderResponse {
  data?: FinnhubInsiderItem[];
  symbol?: string;
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

export interface FinnhubProfile {
  name?: string;
  ticker?: string;
  country?: string;
  currency?: string;
  exchange?: string;
  ipo?: string;
  marketCapitalization?: number; // in millions USD
  shareOutstanding?: number; // in millions
  phone?: string;
  weburl?: string;
  logo?: string;
  finnhubIndustry?: string;
}
