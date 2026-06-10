/**
 * Pure transforms from yahoo-finance2 shapes to domain types.
 */

import type {
  QuoteData,
  DividendData,
  EventData,
  HistoricalPrice,
} from "../types/index.js";

/** A row from yahoo-finance2 `historical()` (fields vary by `events` option). */
export interface YahooHistoricalRow {
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  adjClose?: number;
  dividends?: number;
  split?: string;
}

/** The subset of a yahoo-finance2 `quote()` result that we map. */
export interface YahooQuoteLike {
  regularMarketPrice?: number;
  regularMarketOpen?: number;
  regularMarketDayHigh?: number;
  regularMarketDayLow?: number;
  regularMarketPreviousClose?: number;
  regularMarketChange?: number;
  regularMarketChangePercent?: number;
  regularMarketVolume?: number;
  regularMarketTime?: Date | number;
  currency?: string;
  preMarketPrice?: number;
  preMarketChange?: number;
  preMarketChangePercent?: number;
  postMarketPrice?: number;
  postMarketChange?: number;
  postMarketChangePercent?: number;
  marketState?: string;
}

/** Parse a Yahoo timestamp (Date or epoch seconds) to a Date. */
export function parseTimestamp(timestamp: Date | number | undefined): Date {
  if (timestamp instanceof Date) return timestamp;
  if (typeof timestamp === "number") return new Date(timestamp * 1000);
  return new Date();
}

export function mapQuote(quote: YahooQuoteLike, symbol: string): QuoteData {
  return {
    symbol,
    price: quote.regularMarketPrice!,
    ...(quote.regularMarketOpen !== undefined && {
      open: quote.regularMarketOpen,
    }),
    ...(quote.regularMarketDayHigh !== undefined && {
      high: quote.regularMarketDayHigh,
    }),
    ...(quote.regularMarketDayLow !== undefined && {
      low: quote.regularMarketDayLow,
    }),
    ...(quote.regularMarketPreviousClose !== undefined && {
      close: quote.regularMarketPreviousClose,
      previousClose: quote.regularMarketPreviousClose,
    }),
    ...(quote.regularMarketChange !== undefined && {
      change: quote.regularMarketChange,
    }),
    ...(quote.regularMarketChangePercent !== undefined && {
      changePercent: quote.regularMarketChangePercent,
    }),
    ...(quote.regularMarketVolume !== undefined && {
      volume: quote.regularMarketVolume,
    }),
    timestamp: parseTimestamp(quote.regularMarketTime),
    currency: quote.currency || "USD",
    ...(quote.preMarketPrice !== undefined && {
      preMarketPrice: quote.preMarketPrice,
    }),
    ...(quote.preMarketChange !== undefined && {
      preMarketChange: quote.preMarketChange,
    }),
    ...(quote.preMarketChangePercent !== undefined && {
      preMarketChangePercent: quote.preMarketChangePercent,
    }),
    ...(quote.postMarketPrice !== undefined && {
      postMarketPrice: quote.postMarketPrice,
    }),
    ...(quote.postMarketChange !== undefined && {
      postMarketChange: quote.postMarketChange,
    }),
    ...(quote.postMarketChangePercent !== undefined && {
      postMarketChangePercent: quote.postMarketChangePercent,
    }),
    ...(quote.marketState !== undefined && { marketState: quote.marketState }),
  };
}

export function mapDividends(rows: YahooHistoricalRow[]): DividendData[] {
  return rows
    .filter((item) => item.dividends !== undefined)
    .map((item) => ({
      exDate: new Date(item.date),
      amount: item.dividends!,
      currency: "USD",
    }));
}

export function mapSplitEvents(rows: YahooHistoricalRow[]): EventData[] {
  return rows
    .filter((item) => item.split !== undefined)
    .map((item) => {
      const [numerator = 0, denominator = 1] = item
        .split!.split(":")
        .map((n) => parseFloat(n));
      return {
        type: numerator > denominator ? "split" : "reverse_split",
        date: new Date(item.date),
        description: `${item.split} stock split`,
        details: { ratio: item.split },
      };
    });
}

export function mapHistorical(rows: YahooHistoricalRow[]): HistoricalPrice[] {
  return rows.map((item) => ({
    date: item.date.toISOString().split("T")[0]!,
    open: item.open,
    high: item.high,
    low: item.low,
    close: item.close,
    volume: item.volume,
  }));
}
