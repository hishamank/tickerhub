/**
 * Data Types
 *
 * Defines data structures returned by market data providers.
 */

/**
 * Stock quote data structure
 * Note: Optional properties use `| undefined` for exactOptionalPropertyTypes compatibility
 */
export interface QuoteData {
  symbol: string;
  price: number;
  open?: number | undefined;
  high?: number | undefined;
  low?: number | undefined;
  close?: number | undefined;
  previousClose?: number | undefined;
  change?: number | undefined;
  changePercent?: number | undefined;
  volume?: number | undefined;
  timestamp: Date;
  currency?: string | undefined;
  weekHigh52?: number | undefined;
  weekLow52?: number | undefined;
  /** Price in the native currency of the exchange (before FX conversion) */
  nativePrice?: number | undefined;
  /** Native currency code (e.g., DKK, GBP, EUR) */
  nativeCurrency?: string | undefined;
  /** FX rate used for conversion (native → USD) */
  fxRate?: number | undefined;

  // ── Extended hours ─────────────────────────────────────────────────
  /** Premarket price (available from Yahoo Finance during pre-market session) */
  preMarketPrice?: number | undefined;
  /** Premarket dollar change from previous close */
  preMarketChange?: number | undefined;
  /** Premarket percent change from previous close */
  preMarketChangePercent?: number | undefined;
  /** Post-market (after-hours) price */
  postMarketPrice?: number | undefined;
  /** Post-market dollar change from previous close */
  postMarketChange?: number | undefined;
  /** Post-market percent change from previous close */
  postMarketChangePercent?: number | undefined;
  /** Current market session state (e.g., 'REGULAR', 'PRE', 'POST', 'CLOSED') */
  marketState?: string | undefined;
}

/**
 * Dividend data structure
 * Note: Optional properties use `| undefined` for exactOptionalPropertyTypes compatibility
 */
export interface DividendData {
  exDate: Date;
  paymentDate?: Date | undefined;
  recordDate?: Date | undefined;
  declaredDate?: Date | undefined;
  amount: number;
  currency?: string | undefined;
  frequency?: "annual" | "semi_annual" | "quarterly" | "monthly" | undefined;
}

/**
 * Earnings data structure
 * Note: Optional properties use `| undefined` for exactOptionalPropertyTypes compatibility
 */
export interface EarningsData {
  date: Date;
  fiscalQuarter: string;
  fiscalYear: number;
  confirmed?: boolean; // False if date is a quarter-end placeholder (e.g., Mar 31, Jun 30)
  tentativeQuarter?: string; // For unconfirmed quarter-end placeholder dates (e.g., "Q1")
  // EPS data
  estimate?: number | undefined;
  actual?: number | undefined;
  surprise?: number | undefined;
  surprisePercent?: number | undefined;
  // Revenue data
  revenueEstimate?: number | undefined;
  revenueActual?: number | undefined;
  revenueSurprise?: number | undefined;
  revenueSurprisePercent?: number | undefined;
}

/**
 * Corporate event data structure
 * Note: Optional properties use `| undefined` for exactOptionalPropertyTypes compatibility
 */
export interface EventData {
  type:
    | "split"
    | "reverse_split"
    | "merger"
    | "acquisition"
    | "spinoff"
    | "delisting"
    | "ipo";
  date: Date;
  description: string;
  details?: {
    ratio?: string | undefined;
    acquirer?: string | undefined;
    ticker?: string | undefined;
    // Allow additional provider-specific metadata
    [key: string]: unknown;
  } | undefined;
}

/**
 * Analyst rating data structure
 * Note: Optional properties use `| undefined` for exactOptionalPropertyTypes compatibility
 */
export interface RatingData {
  consensus: "strong_buy" | "buy" | "hold" | "sell" | "strong_sell";
  targetPrice?: number | undefined;
  targetPriceHigh?: number | undefined;
  targetPriceLow?: number | undefined;
  numberOfAnalysts: number;
  ratings?: Array<{
    firm?: string | undefined;
    analyst?: string | undefined;
    rating: string;
    targetPrice?: number | undefined;
    date?: Date | undefined;
  }> | undefined;
}

/**
 * Historical price data point
 * Note: Optional properties use `| undefined` for exactOptionalPropertyTypes compatibility
 */
export interface HistoricalPrice {
  date: string; // ISO date format YYYY-MM-DD
  close: number;
  volume?: number | undefined;
  open?: number | undefined;
  high?: number | undefined;
  low?: number | undefined;
}

/**
 * Option Greeks data structure
 */
export interface OptionGreeks {
  delta?: number | undefined;
  gamma?: number | undefined;
  theta?: number | undefined;
  vega?: number | undefined;
  rho?: number | undefined;
  phi?: number | undefined;
  bidIv?: number | undefined;
  midIv?: number | undefined;
  askIv?: number | undefined;
  smvVol?: number | undefined;
}

/**
 * Option contract quote data structure
 */
export interface OptionContract {
  symbol: string;
  underlyingSymbol: string;
  expirationDate: Date;
  strike: number;
  optionType: "call" | "put";
  description?: string | undefined;
  rootSymbol?: string | undefined;
  bid?: number | undefined;
  ask?: number | undefined;
  last?: number | undefined;
  change?: number | undefined;
  changePercent?: number | undefined;
  volume?: number | undefined;
  openInterest?: number | undefined;
  bidSize?: number | undefined;
  askSize?: number | undefined;
  lastVolume?: number | undefined;
  tradeDate?: Date | undefined;
  quoteDate?: Date | undefined;
  greeks?: OptionGreeks | undefined;
}

/**
 * Option chain data structure for a single expiration date.
 */
export interface OptionChain {
  underlyingSymbol: string;
  expirationDate: Date;
  options: OptionContract[];
}

/**
 * News article (company or market news).
 */
export interface NewsArticle {
  headline: string;
  url: string;
  publishedAt: Date;
  summary?: string | undefined;
  source?: string | undefined;
  imageUrl?: string | undefined;
  symbols?: string[] | undefined;
}

/**
 * IPO calendar entry.
 */
export interface IpoEvent {
  date: string; // ISO date YYYY-MM-DD
  symbol?: string | undefined;
  name?: string | undefined;
  exchange?: string | undefined;
  priceRangeLow?: number | undefined;
  priceRangeHigh?: number | undefined;
  shares?: number | undefined;
  status?: string | undefined;
}

/**
 * Symbol search / lookup result.
 */
export interface SymbolSearchResult {
  symbol: string;
  name?: string | undefined;
  exchange?: string | undefined;
  type?: string | undefined;
  currency?: string | undefined;
}

/**
 * Insider transaction (Form 3/4-style filing).
 */
export interface InsiderTransaction {
  symbol: string;
  name?: string | undefined;
  transactionDate?: string | undefined; // ISO date
  shares?: number | undefined;
  change?: number | undefined;
  price?: number | undefined;
  transactionType?: string | undefined;
}

/**
 * A single technical-indicator series for a symbol.
 */
export interface TechnicalIndicator {
  symbol: string;
  indicator: string; // e.g. "sma", "rsi"
  interval?: string | undefined; // e.g. "daily"
  values: Array<{ date: string; value: number }>;
}

/**
 * A market mover (gainer / loser / most-active).
 */
export interface MarketMover {
  symbol: string;
  name?: string | undefined;
  price?: number | undefined;
  change?: number | undefined;
  changePercent?: number | undefined;
}

/**
 * Ranked crypto market entry.
 */
export interface CryptoMarket {
  symbol: string;
  name?: string | undefined;
  price: number;
  marketCap?: number | undefined;
  volume24h?: number | undefined;
  change24h?: number | undefined;
  rank?: number | undefined;
}

/**
 * A foreign-exchange rate between two currencies.
 */
export interface ForexRate {
  from: string;
  to: string;
  rate: number;
  timestamp: Date;
  bid?: number | undefined;
  ask?: number | undefined;
}

/**
 * Company profile / fundamentals snapshot.
 * Note: Optional properties use `| undefined` for exactOptionalPropertyTypes compatibility
 */
export interface CompanyProfile {
  symbol: string;
  name?: string | undefined;
  description?: string | undefined;
  exchange?: string | undefined;
  currency?: string | undefined;
  country?: string | undefined;
  sector?: string | undefined;
  industry?: string | undefined;
  website?: string | undefined;
  logo?: string | undefined;
  marketCap?: number | undefined;
  sharesOutstanding?: number | undefined;
  employees?: number | undefined;
  /** IPO / listing date as an ISO date string (YYYY-MM-DD). */
  ipoDate?: string | undefined;
  ceo?: string | undefined;
  phone?: string | undefined;
  address?: string | undefined;
}
