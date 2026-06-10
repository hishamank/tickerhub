/**
 * Pure transforms from Finnhub API shapes to domain types, plus Finnhub-
 * specific error mapping. Kept separate from the provider class so the class
 * stays a thin HTTP/orchestration layer.
 */

import type {
  QuoteData,
  DividendData,
  EventData,
  EarningsData,
  RatingData,
  HistoricalPrice,
} from "../types/index.js";
import { ProviderError, ProviderErrorCode } from "../types/provider.js";
import { handleHttpError } from "./provider-utils.js";
import type {
  FinnhubQuote,
  FinnhubDividend,
  FinnhubNews,
  FinnhubEarningsItem,
  FinnhubRecommendation,
  FinnhubPriceTarget,
  FinnhubCandles,
} from "./finnhub-types.js";

/** Map a Finnhub 429 to a retryable rate-limit error; else standard HTTP mapping. */
export function mapFinnhubError(error: unknown, context: string): never {
  if (error instanceof Error && error.message.includes("429")) {
    throw new ProviderError(
      ProviderErrorCode.RATE_LIMIT_EXCEEDED,
      "Finnhub rate limit exceeded",
      true,
      60,
    );
  }
  handleHttpError(error, context);
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * True if the date is a quarter-end placeholder (Mar 31, Jun 30, Sep 30,
 * Dec 31) — Finnhub uses these when the real announcement date is unknown.
 */
function isQuarterEndDate(date: Date): boolean {
  const month = date.getUTCMonth();
  const isQuarterEndMonth =
    month === 2 || month === 5 || month === 8 || month === 11;
  if (!isQuarterEndMonth) return false;
  const lastDayOfMonth = new Date(
    Date.UTC(date.getUTCFullYear(), month + 1, 0),
  ).getUTCDate();
  return date.getUTCDate() === lastDayOfMonth;
}

function getQuarterFromMonth(date: Date): string {
  const month = date.getUTCMonth();
  if (month <= 2) return "Q1";
  if (month <= 5) return "Q2";
  if (month <= 8) return "Q3";
  return "Q4";
}

export function mapQuote(quote: FinnhubQuote, symbol: string): QuoteData {
  return {
    symbol,
    price: quote.c,
    open: quote.o,
    high: quote.h,
    low: quote.l,
    previousClose: quote.pc,
    change: quote.c - quote.pc,
    changePercent: ((quote.c - quote.pc) / quote.pc) * 100,
    timestamp: new Date(quote.t * 1000),
    currency: "USD",
  };
}

export function mapDividends(dividends: FinnhubDividend[]): DividendData[] {
  return dividends.map((div) => ({
    exDate: new Date(div.date),
    amount: div.amount,
    currency: div.currency || "USD",
    ...(div.payDate && { paymentDate: new Date(div.payDate) }),
  }));
}

/** Detect corporate events from company-news headlines (best-effort). */
export function detectEvents(news: FinnhubNews[]): EventData[] {
  const events: EventData[] = [];
  for (const article of news) {
    const headline = (article.headline || "").toLowerCase();
    const summary = (article.summary || "").toLowerCase();
    const text = `${headline} ${summary}`;
    const date = new Date(article.datetime * 1000);
    const details = { source: "news", url: article.url };

    if (
      text.includes("stock split") &&
      !text.includes("reverse") &&
      !events.some((e) => e.type === "split" && isSameDay(e.date, date))
    ) {
      events.push({ type: "split", date, description: article.headline, details });
    }

    if (
      (text.includes("reverse split") ||
        text.includes("reverse stock split")) &&
      !events.some((e) => e.type === "reverse_split" && isSameDay(e.date, date))
    ) {
      events.push({
        type: "reverse_split",
        date,
        description: article.headline,
        details,
      });
    }

    if (
      (text.includes("merger") ||
        text.includes("acquire") ||
        text.includes("acquisition")) &&
      !events.some((e) => e.type === "merger" && isSameDay(e.date, date))
    ) {
      const type = text.includes("merger") ? "merger" : "acquisition";
      events.push({ type, date, description: article.headline, details });
    }
  }
  return events;
}

export function mapEarnings(items: FinnhubEarningsItem[]): EarningsData[] {
  return items.map((item) => {
    const earningsDate = new Date(item.date);
    const isQuarterEnd = isQuarterEndDate(earningsDate);
    const tentativeQuarter = isQuarterEnd
      ? getQuarterFromMonth(earningsDate)
      : undefined;
    const hasEps =
      item.epsActual != null && item.epsEstimate != null;
    const hasRev =
      item.revenueActual != null && item.revenueEstimate != null;

    return {
      date: earningsDate,
      fiscalQuarter: item.quarter ? `Q${item.quarter}` : "Unknown",
      fiscalYear: item.year,
      confirmed: !isQuarterEnd,
      tentativeQuarter,
      ...(item.epsEstimate != null && { estimate: item.epsEstimate }),
      ...(item.epsActual != null && { actual: item.epsActual }),
      ...(hasEps && { surprise: item.epsActual! - item.epsEstimate! }),
      ...(hasEps &&
        item.epsEstimate !== 0 && {
          surprisePercent:
            ((item.epsActual! - item.epsEstimate!) /
              Math.abs(item.epsEstimate!)) *
            100,
        }),
      ...(item.revenueEstimate != null && {
        revenueEstimate: item.revenueEstimate,
      }),
      ...(item.revenueActual != null && { revenueActual: item.revenueActual }),
      ...(hasRev && {
        revenueSurprise: item.revenueActual! - item.revenueEstimate!,
      }),
      ...(hasRev &&
        item.revenueEstimate !== 0 && {
          revenueSurprisePercent:
            ((item.revenueActual! - item.revenueEstimate!) /
              Math.abs(item.revenueEstimate!)) *
            100,
        }),
    };
  });
}

export function buildRating(
  latest: FinnhubRecommendation,
  target: FinnhubPriceTarget,
): RatingData {
  const totalRatings =
    latest.strongBuy +
    latest.buy +
    latest.hold +
    latest.sell +
    latest.strongSell;
  const buyScore =
    (latest.strongBuy * 5 +
      latest.buy * 4 +
      latest.hold * 3 +
      latest.sell * 2 +
      latest.strongSell * 1) /
    totalRatings;

  let consensus: RatingData["consensus"];
  if (buyScore >= 4.5) consensus = "strong_buy";
  else if (buyScore >= 3.5) consensus = "buy";
  else if (buyScore >= 2.5) consensus = "hold";
  else if (buyScore >= 1.5) consensus = "sell";
  else consensus = "strong_sell";

  return {
    consensus,
    targetPrice: target?.targetMean ?? undefined,
    targetPriceHigh: target?.targetHigh ?? undefined,
    targetPriceLow: target?.targetLow ?? undefined,
    numberOfAnalysts: totalRatings,
  };
}

export function mapCandles(candles: FinnhubCandles): HistoricalPrice[] {
  const prices: HistoricalPrice[] = [];
  for (let i = 0; i < candles.t.length; i++) {
    const date = new Date(candles.t[i]! * 1000);
    prices.push({
      date: date.toISOString().split("T")[0]!,
      open: candles.o[i]!,
      high: candles.h[i]!,
      low: candles.l[i]!,
      close: candles.c[i]!,
      volume: candles.v[i]!,
    });
  }
  return prices;
}
