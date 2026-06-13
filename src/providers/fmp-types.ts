/**
 * Financial Modeling Prep (FMP) API response shapes (the subset consumed here).
 */

export interface FMPQuoteResponse {
  symbol: string;
  name: string;
  price: number;
  changesPercentage: number;
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

export interface FMPDividendHistory {
  historical?: FMPDividend[];
}

export interface FMPEarningsItem {
  date: string;
  quarter: number;
  fiscalYear?: number;
  epsEstimate?: number;
  epsActual?: number;
  revenueEstimated?: number;
  revenue?: number;
}

export interface FMPRating {
  rating: string;
  ratingTargetPrice?: number;
}

export interface FMPHistoricalItem {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface FMPHistoricalResponse {
  historical?: FMPHistoricalItem[];
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
  mktCap?: number;
}
