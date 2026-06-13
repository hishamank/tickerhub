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

  // Profile (company fundamentals): Yahoo keyless, Finnhub/FMP detailed
  profile: ["yahoo-finance", "finnhub", "fmp"],

  // News: Finnhub + FMP company news on free tiers
  news: ["finnhub", "fmp"],

  // IPO calendar
  ipo: ["finnhub", "fmp"],

  // Symbol search / lookup
  search: ["finnhub", "fmp"],

  // Insider transactions
  insider: ["finnhub", "fmp"],

  // Technical indicators: Alpha Vantage has the broadest free TA suite
  technicals: ["alpha-vantage"],

  // Market movers (gainers/losers/actives)
  movers: ["fmp"],

  // Crypto (asset-class namespace): CoinGecko is the keyless leader
  crypto_quote: ["coingecko"],
  crypto_historical: ["coingecko"],
  crypto_markets: ["coingecko"],

  // Forex (asset-class namespace)
  forex_rate: ["alpha-vantage", "fmp"],
  forex_historical: ["alpha-vantage"],
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
  rateLimitPerHour: number | null;
  rateLimitPerDay: number | null;
  rateLimitPerMonth: number | null;
}

export const BUILTIN_PROVIDERS: BuiltinProviderMeta[] = [
  {
    name: "yahoo-finance",
    providerType: "market_data",
    requiresKey: false,
    reliabilityScore: 4.5,
    paidTier: false,
    supportedDataTypes: ["prices", "dividends", "earnings", "events", "profile"],
    rateLimitPerMinute: null,
    rateLimitPerHour: null,
    rateLimitPerDay: null,
    rateLimitPerMonth: null,
  },
  {
    name: "finnhub",
    providerType: "market_data",
    requiresKey: true,
    reliabilityScore: 4.0,
    paidTier: false,
    supportedDataTypes: [
      "prices",
      "dividends",
      "earnings",
      "ratings",
      "profile",
      "news",
      "ipo",
      "search",
      "insider",
    ],
    rateLimitPerMinute: 60,
    rateLimitPerHour: null,
    rateLimitPerDay: null,
    rateLimitPerMonth: null,
  },
  {
    name: "fmp",
    providerType: "market_data",
    requiresKey: true,
    reliabilityScore: 3.5,
    paidTier: false,
    supportedDataTypes: [
      "prices",
      "dividends",
      "earnings",
      "ratings",
      "events",
      "profile",
      "news",
      "ipo",
      "search",
      "insider",
      "movers",
      "forex_rate",
    ],
    rateLimitPerMinute: null,
    rateLimitPerHour: null,
    rateLimitPerDay: 250,
    rateLimitPerMonth: null,
  },
  {
    name: "tiingo",
    providerType: "market_data",
    requiresKey: true,
    reliabilityScore: 3.5,
    paidTier: false,
    supportedDataTypes: ["prices", "dividends"],
    rateLimitPerMinute: null,
    rateLimitPerHour: 50,
    rateLimitPerDay: 1000,
    rateLimitPerMonth: null,
  },
  {
    name: "polygon",
    providerType: "market_data",
    requiresKey: true,
    reliabilityScore: 4.0,
    paidTier: false,
    supportedDataTypes: ["prices", "dividends", "events"],
    rateLimitPerMinute: 5,
    rateLimitPerHour: null,
    rateLimitPerDay: null,
    rateLimitPerMonth: null,
  },
  {
    name: "alpha-vantage",
    providerType: "market_data",
    requiresKey: true,
    reliabilityScore: 3.0,
    paidTier: false,
    supportedDataTypes: [
      "prices",
      "dividends",
      "earnings",
      "technicals",
      "forex_rate",
      "forex_historical",
    ],
    rateLimitPerMinute: 5,
    rateLimitPerHour: null,
    rateLimitPerDay: 25, // Free tier dropped from 500 → 100 → 25/day (2023–2024)
    rateLimitPerMonth: null,
  },
  {
    name: "twelve-data",
    providerType: "market_data",
    requiresKey: true,
    reliabilityScore: 3.5,
    paidTier: false,
    supportedDataTypes: ["prices"],
    rateLimitPerMinute: 8,
    rateLimitPerHour: null,
    rateLimitPerDay: 800,
    rateLimitPerMonth: null,
  },
  {
    name: "alpaca",
    providerType: "market_data",
    requiresKey: true,
    reliabilityScore: 4.0,
    paidTier: false,
    supportedDataTypes: ["prices"],
    rateLimitPerMinute: 200,
    rateLimitPerHour: null,
    rateLimitPerDay: null,
    rateLimitPerMonth: null,
  },
  {
    name: "tradier",
    providerType: "market_data",
    requiresKey: true,
    reliabilityScore: 3.5,
    paidTier: false,
    supportedDataTypes: ["options"],
    rateLimitPerMinute: 120,
    rateLimitPerHour: null,
    rateLimitPerDay: null,
    rateLimitPerMonth: null,
  },
  {
    name: "nasdaq-data-link",
    providerType: "market_data",
    requiresKey: true,
    reliabilityScore: 3.5,
    paidTier: false,
    supportedDataTypes: ["macro"],
    rateLimitPerMinute: null,
    rateLimitPerHour: null,
    rateLimitPerDay: 50000, // Authenticated free key: 50k/day (50/day is keyless)
    rateLimitPerMonth: null,
  },
  {
    name: "marketstack",
    providerType: "market_data",
    requiresKey: true,
    reliabilityScore: 2.5,
    paidTier: false,
    supportedDataTypes: ["prices"],
    rateLimitPerMinute: null,
    rateLimitPerHour: null,
    rateLimitPerDay: null,
    rateLimitPerMonth: 100, // Free tier: 100 requests/month, EOD only
  },
  {
    name: "coingecko",
    providerType: "market_data",
    requiresKey: false,
    reliabilityScore: 4.0,
    paidTier: false,
    supportedDataTypes: [
      "prices",
      "crypto_quote",
      "crypto_historical",
      "crypto_markets",
    ],
    rateLimitPerMinute: 30,
    rateLimitPerHour: null,
    rateLimitPerDay: null,
    rateLimitPerMonth: 10000, // Demo key: ~10k calls/month
  },
];
