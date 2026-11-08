/**
 * Financial Modeling Prep (FMP) API response shapes (the subset consumed here).
 */

export interface FMPQuoteResponse {
  symbol: string;
  name: string;
  price: number;
  changePercentage: number;
  change: number;
  dayLow: number;
  dayHigh: number;
  open: number;
  previousClose: number;
  volume: number;
  timestamp: number;
}

export interface FMPDividend {
  date: string;
  dividend: number;
  paymentDate?: string;
  recordDate?: string;
}

export interface FMPEarningsItem {
  date: string;
  quarter?: number;
  fiscalYear?: number;
  epsEstimated?: number;
  /** Pre-stable name, still accepted because the stable shape is unverified. */
  epsEstimate?: number;
  epsActual?: number;
  revenueEstimated?: number;
  revenueActual?: number;
  /** Pre-stable name, still accepted because the stable shape is unverified. */
  revenue?: number;
}

export interface FMPRating {
  rating: string;
  overallScore?: number;
}

export interface FMPHistoricalItem {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface FMPProfile {
  symbol?: string;
  companyName?: string;
  currency?: string;
  exchangeShortName?: string;
  exchange?: string;
  industry?: string;
  sector?: string;
  country?: string;
  website?: string;
  description?: string;
  ceo?: string;
  fullTimeEmployees?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  image?: string;
  ipoDate?: string;
  marketCap?: number;
  /** Pre-stable field name, still accepted because the stable shape is unverified. */
  mktCap?: number;
}
