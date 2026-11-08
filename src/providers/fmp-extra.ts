/**
 * FMP extended capabilities (news, IPO calendar, search, insider trades,
 * market movers, forex rate). Kept out of the provider class to respect the
 * file-size cap. Each function takes a bound fetcher that prepends the host and
 * appends the API key, and raises a typed ProviderError on denied responses.
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

/** Bound FMP fetcher: takes a `/stable/...` path, returns the parsed rows. */
export type FmpGet = <T>(
  apiPath: string,
  label: string,
  target: string,
) => Promise<T[]>;

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
  exchange?: string;
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
  changePercentage?: number;
}
interface FmpFxQuote {
  symbol: string;
  price?: number;
  bid?: number;
  ask?: number;
}

const MOVER_ENDPOINTS = {
  gainers: "biggest-gainers",
  losers: "biggest-losers",
  actives: "most-actives",
} as const;

export async function fmpNews(
  get: FmpGet,
  symbol: string,
): Promise<NewsArticle[]> {
  const sym = symbol.toUpperCase();
  const data = await get<FmpNewsItem>(`/stable/news/stock?symbols=${encodeURIComponent(sym)}&limit=50`, "news", symbol);
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
  const data = await get<FmpIpoItem>(`/stable/ipos-calendar`, "ipo calendar", "");
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
  const data = await get<FmpSearchItem>(`/stable/search-symbol?query=${encodeURIComponent(query)}&limit=25`, "search", query);
  return data.map((r) =>
    validateData(
      SymbolSearchResultSchema,
      {
        symbol: r.symbol,
        name: r.name || undefined,
        exchange: r.exchange || r.exchangeShortName || r.stockExchange || undefined,
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
  const data = await get<FmpInsiderItem>(`/stable/insider-trading/search?symbol=${encodeURIComponent(sym)}&page=0`, "insider trading", symbol);
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
  const data = await get<FmpMoverItem>(`/stable/${MOVER_ENDPOINTS[direction]}`, "movers", direction);
  return data.map((m) =>
    validateData(
      MarketMoverSchema,
      {
        symbol: m.symbol,
        name: m.name || undefined,
        price: m.price ?? undefined,
        change: m.change ?? undefined,
        changePercent: m.changesPercentage ?? m.changePercentage ?? undefined,
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
  const data = await get<FmpFxQuote>(`/stable/quote?symbol=${encodeURIComponent(pair)}`, "forex rate", pair);
  const quote = data[0];
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
