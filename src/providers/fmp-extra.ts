/**
 * FMP extended capabilities (news, IPO calendar, search, insider trades,
 * market movers, forex rate). Kept out of the provider class to respect the
 * file-size cap. Each function takes a bound fetcher that prepends the host and
 * appends the API key, and degrades to empty/null on 403 (paid-plan) responses.
 */

import type {
  NewsArticle,
  IpoEvent,
  SymbolSearchResult,
  InsiderTransaction,
  MarketMover,
  ForexRate,
} from "../types/index.js";
import {
  NewsArticleSchema,
  IpoEventSchema,
  SymbolSearchResultSchema,
  InsiderTransactionSchema,
  MarketMoverSchema,
  ForexRateSchema,
  validateData,
} from "../types/validation.js";
import { fmpForbiddenOrThrow } from "./fmp-mappers.js";

/** Bound FMP fetcher: takes an `/api/vN/...` path, returns the raw Response. */
export type FmpGet = (apiPath: string) => Promise<Response>;

interface FmpNewsItem {
  title: string;
  text?: string;
  url: string;
  image?: string;
  site?: string;
  publishedDate?: string;
  symbol?: string;
}
interface FmpIpoItem {
  date: string;
  company?: string;
  symbol?: string;
  exchange?: string;
  shares?: number;
  priceRange?: string;
  actions?: string;
}
interface FmpSearchItem {
  symbol: string;
  name?: string;
  currency?: string;
  exchangeShortName?: string;
  stockExchange?: string;
}
interface FmpInsiderItem {
  symbol?: string;
  reportingName?: string;
  transactionDate?: string;
  securitiesTransacted?: number;
  price?: number;
  transactionType?: string;
}
interface FmpMoverItem {
  symbol: string;
  name?: string;
  price?: number;
  change?: number;
  changesPercentage?: number;
}
interface FmpFxQuote {
  symbol: string;
  price?: number;
  bid?: number;
  ask?: number;
}

export async function fmpNews(
  get: FmpGet,
  symbol: string,
): Promise<NewsArticle[]> {
  const sym = symbol.toUpperCase();
  const res = await get(`/api/v3/stock_news?tickers=${sym}&limit=50`);
  if (fmpForbiddenOrThrow(res, "news", symbol)) return [];
  const data = (await res.json()) as FmpNewsItem[];
  if (!Array.isArray(data)) return [];
  return data.map((n) =>
    validateData(
      NewsArticleSchema,
      {
        headline: n.title,
        url: n.url,
        publishedAt: n.publishedDate ? new Date(n.publishedDate) : new Date(),
        summary: n.text || undefined,
        source: n.site || undefined,
        imageUrl: n.image || undefined,
        symbols: n.symbol ? [n.symbol] : [sym],
      },
      `FMP news for ${symbol}`,
    ),
  );
}

export async function fmpIpoCalendar(get: FmpGet): Promise<IpoEvent[]> {
  const res = await get(`/api/v3/ipo_calendar`);
  if (fmpForbiddenOrThrow(res, "ipo calendar", "")) return [];
  const data = (await res.json()) as FmpIpoItem[];
  if (!Array.isArray(data)) return [];
  return data.map((i) =>
    validateData(
      IpoEventSchema,
      {
        date: i.date,
        symbol: i.symbol || undefined,
        name: i.company || undefined,
        exchange: i.exchange || undefined,
        shares: i.shares ?? undefined,
        status: i.actions || undefined,
      },
      "FMP IPO calendar",
    ),
  );
}

export async function fmpSearch(
  get: FmpGet,
  query: string,
): Promise<SymbolSearchResult[]> {
  const res = await get(`/api/v3/search?query=${encodeURIComponent(query)}&limit=25`);
  if (fmpForbiddenOrThrow(res, "search", query)) return [];
  const data = (await res.json()) as FmpSearchItem[];
  if (!Array.isArray(data)) return [];
  return data.map((r) =>
    validateData(
      SymbolSearchResultSchema,
      {
        symbol: r.symbol,
        name: r.name || undefined,
        exchange: r.exchangeShortName || r.stockExchange || undefined,
        currency: r.currency || undefined,
      },
      `FMP search for ${query}`,
    ),
  );
}

export async function fmpInsider(
  get: FmpGet,
  symbol: string,
): Promise<InsiderTransaction[]> {
  const sym = symbol.toUpperCase();
  const res = await get(`/api/v4/insider-trading?symbol=${sym}&page=0`);
  if (fmpForbiddenOrThrow(res, "insider trading", symbol)) return [];
  const data = (await res.json()) as FmpInsiderItem[];
  if (!Array.isArray(data)) return [];
  return data.map((t) =>
    validateData(
      InsiderTransactionSchema,
      {
        symbol: t.symbol || sym,
        name: t.reportingName || undefined,
        transactionDate: t.transactionDate || undefined,
        shares: t.securitiesTransacted ?? undefined,
        price: t.price ?? undefined,
        transactionType: t.transactionType || undefined,
      },
      `FMP insider for ${symbol}`,
    ),
  );
}

export async function fmpMovers(
  get: FmpGet,
  direction: "gainers" | "losers" | "actives",
): Promise<MarketMover[]> {
  const res = await get(`/api/v3/stock_market/${direction}`);
  if (fmpForbiddenOrThrow(res, "movers", direction)) return [];
  const data = (await res.json()) as FmpMoverItem[];
  if (!Array.isArray(data)) return [];
  return data.map((m) =>
    validateData(
      MarketMoverSchema,
      {
        symbol: m.symbol,
        name: m.name || undefined,
        price: m.price ?? undefined,
        change: m.change ?? undefined,
        changePercent: m.changesPercentage ?? undefined,
      },
      `FMP movers (${direction})`,
    ),
  );
}

export async function fmpForexRate(
  get: FmpGet,
  from: string,
  to: string,
): Promise<ForexRate | null> {
  const pair = `${from.toUpperCase()}${to.toUpperCase()}`;
  const res = await get(`/api/v3/quote/${pair}`);
  if (fmpForbiddenOrThrow(res, "forex rate", pair)) return null;
  const data = (await res.json()) as FmpFxQuote[];
  const quote = Array.isArray(data) ? data[0] : undefined;
  if (!quote || quote.price == null) return null;
  return validateData(
    ForexRateSchema,
    {
      from: from.toUpperCase(),
      to: to.toUpperCase(),
      rate: quote.price,
      timestamp: new Date(),
      bid: quote.bid ?? undefined,
      ask: quote.ask ?? undefined,
    },
    `FMP forex rate ${pair}`,
  );
}
