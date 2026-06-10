/**
 * Default Provider Priorities
 *
 * Defines default provider priority order by data type.
 *
 * Priority is based on:
 * 1. Data quality for that specific type
 * 2. Rate limit generosity
 * 3. Reliability score
 */

import type { DataType } from "../types/provider.js";

/**
 * Default provider priority order by data type
 */
export const DEFAULT_PROVIDER_PRIORITIES: Record<DataType, string[]> = {
  // Quotes: Yahoo has no API key, best free limits. Alpaca has generous rate limits (IEX data, US-only).
  // Marketstack is last-resort fallback for international tickers (very restrictive free tier)
  prices: [
    "yahoo-finance",
    "finnhub",
    "fmp",
    "tiingo",
    "alpaca",
    "alpha-vantage",
    "polygon",
    "twelve-data",
    "marketstack",
  ],
  // Dividends: Yahoo most reliable, Tiingo good historical
  dividends: [
    "yahoo-finance",
    "tiingo",
    "finnhub",
    "fmp",
    "polygon",
    "alpha-vantage",
  ],

  // Earnings: Finnhub/FMP include revenue data
  earnings: ["finnhub", "fmp", "yahoo-finance", "alpha-vantage"],

  // Ratings: Only Finnhub and FMP support
  ratings: ["finnhub", "fmp"],

  // Options: Tradier is the primary value-add provider
  options: ["tradier"],

  // Events (splits): Yahoo and FMP have good coverage
  events: ["yahoo-finance", "fmp", "polygon"],

  // Macro (economic indicators): Nasdaq Data Link provides FRED data
  macro: ["nasdaq-data-link"],
};

/**
 * Get provider priority for a data type
 */
export function getProviderPriority(dataType: DataType): string[] {
  return DEFAULT_PROVIDER_PRIORITIES[dataType] || [];
}

/**
 * Provider reliability scores (0-5)
 * Used as tiebreaker when multiple providers are available
 */
export const PROVIDER_RELIABILITY_SCORES: Record<string, number> = {
  "yahoo-finance": 4.5,
  finnhub: 4.0,
  tiingo: 3.5,
  fmp: 3.5,
  polygon: 4.0,
  "alpha-vantage": 3.0,
  "twelve-data": 3.5,
  alpaca: 4.0,
  "nasdaq-data-link": 3.5,
  marketstack: 2.5,
};

/**
 * Built-in provider metadata used as baseline when DB rows are missing.
 * DB rows override these values when present.
 */
export interface BuiltinProviderMeta {
  name: string;
  providerType: string;
  requiresKey: boolean;
  reliabilityScore: number;
  paidTier: boolean;
  supportedDataTypes: DataType[];
  rateLimitPerMinute: number | null;
  rateLimitPerDay: number | null;
}

export const BUILTIN_PROVIDERS: BuiltinProviderMeta[] = [
  {
    name: "yahoo-finance",
    providerType: "market_data",
    requiresKey: false,
    reliabilityScore: 4.5,
    paidTier: false,
    supportedDataTypes: ["prices", "dividends", "earnings", "events"],
    rateLimitPerMinute: null,
    rateLimitPerDay: null,
  },
  {
    name: "finnhub",
    providerType: "market_data",
    requiresKey: true,
    reliabilityScore: 4.0,
    paidTier: false,
    supportedDataTypes: ["prices", "dividends", "earnings", "ratings"],
    rateLimitPerMinute: 60,
    rateLimitPerDay: null,
  },
  {
    name: "fmp",
    providerType: "market_data",
    requiresKey: true,
    reliabilityScore: 3.5,
    paidTier: false,
    supportedDataTypes: ["prices", "dividends", "earnings", "ratings", "events"],
    rateLimitPerMinute: null,
    rateLimitPerDay: 250,
  },
  {
    name: "tiingo",
    providerType: "market_data",
    requiresKey: true,
    reliabilityScore: 3.5,
    paidTier: false,
    supportedDataTypes: ["prices", "dividends"],
    rateLimitPerMinute: null,
    rateLimitPerDay: 1000,
  },
  {
    name: "polygon",
    providerType: "market_data",
    requiresKey: true,
    reliabilityScore: 4.0,
    paidTier: false,
    supportedDataTypes: ["prices", "dividends", "events"],
    rateLimitPerMinute: 5,
    rateLimitPerDay: null,
  },
  {
    name: "alpha-vantage",
    providerType: "market_data",
    requiresKey: true,
    reliabilityScore: 3.0,
    paidTier: false,
    supportedDataTypes: ["prices", "dividends", "earnings"],
    rateLimitPerMinute: 5,
    rateLimitPerDay: 500,
  },
  {
    name: "twelve-data",
    providerType: "market_data",
    requiresKey: true,
    reliabilityScore: 3.5,
    paidTier: false,
    supportedDataTypes: ["prices"],
    rateLimitPerMinute: 8,
    rateLimitPerDay: 800,
  },
  {
    name: "alpaca",
    providerType: "market_data",
    requiresKey: true,
    reliabilityScore: 4.0,
    paidTier: false,
    supportedDataTypes: ["prices"],
    rateLimitPerMinute: 200,
    rateLimitPerDay: null,
  },
  {
    name: "tradier",
    providerType: "market_data",
    requiresKey: true,
    reliabilityScore: 3.5,
    paidTier: false,
    supportedDataTypes: ["options"],
    rateLimitPerMinute: 120,
    rateLimitPerDay: null,
  },
  {
    name: "nasdaq-data-link",
    providerType: "market_data",
    requiresKey: true,
    reliabilityScore: 3.5,
    paidTier: false,
    supportedDataTypes: ["macro"],
    rateLimitPerMinute: null,
    rateLimitPerDay: 50,
  },
  {
    name: "marketstack",
    providerType: "market_data",
    requiresKey: true,
    reliabilityScore: 2.5,
    paidTier: false,
    supportedDataTypes: ["prices"],
    rateLimitPerMinute: null,
    rateLimitPerDay: 100,
  },
  {
    name: "coingecko",
    providerType: "market_data",
    requiresKey: false,
    reliabilityScore: 4.0,
    paidTier: false,
    supportedDataTypes: ["prices"],
    rateLimitPerMinute: 30,
    rateLimitPerDay: null,
  },
];
