/**
 * Polygon API response shapes (the subset consumed here).
 */

export interface PolygonSnapshotResponse {
  ticker?: {
    ticker?: string;
    todaysChangePerc?: number;
    day?: { o?: number; h?: number; l?: number; c?: number; v?: number };
    prevDay?: { c?: number };
    lastTrade?: { p?: number; t?: number };
    updated?: number;
  };
  status?: string;
}

export interface PolygonHistoricalResponse {
  results?: Array<{ t: number; o?: number; h?: number; l?: number; c?: number; v?: number }>;
  resultsCount?: number;
  status?: string;
}

export interface PolygonReferenceResponse<T> {
  results?: T[];
  status?: string;
}
export interface PolygonDividendResult {
  ex_dividend_date?: string;
  pay_date?: string;
  record_date?: string;
  declaration_date?: string;
  cash_amount?: number;
  currency?: string;
  frequency?: number;
}
export interface PolygonSplitResult {
  execution_date?: string;
  split_from?: number;
  split_to?: number;
  ticker?: string;
}
