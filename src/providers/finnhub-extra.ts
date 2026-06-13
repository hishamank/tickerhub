/**
 * Finnhub extended capabilities (news, IPO calendar, symbol search, insider
 * transactions). Kept out of the provider class so the class stays a thin
 * dispatcher under the file-size cap. Each function takes the provider's bound
 * `get` helper and returns validated domain objects.
 */

import type {
  NewsArticle,
  IpoEvent,
  SymbolSearchResult,
  InsiderTransaction,
} from "../types/index.js";
import {
  NewsArticleSchema,
  IpoEventSchema,
  SymbolSearchResultSchema,
  InsiderTransactionSchema,
  validateData,
} from "../types/validation.js";
import { mapFinnhubError } from "./finnhub-mappers.js";
import type {
  FinnhubNews,
  FinnhubIpoResponse,
  FinnhubSearchResponse,
  FinnhubInsiderResponse,
} from "./finnhub-types.js";

/** The provider's bound HTTP getter. */
export type FinnhubGet = <T>(
  path: string,
  params: Record<string, string | number>,
) => Promise<T>;

const ymd = (d: Date): string => d.toISOString().split("T")[0]!;

export async function finnhubNews(
  get: FinnhubGet,
  symbol: string,
): Promise<NewsArticle[]> {
  try {
    const sym = symbol.toUpperCase();
    const from = ymd(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
    const news = await get<FinnhubNews[]>("/company-news", {
      symbol: sym,
      from,
      to: ymd(new Date()),
    });
    if (!Array.isArray(news)) return [];
    return news.slice(0, 50).map((n) =>
      validateData(
        NewsArticleSchema,
        {
          headline: n.headline,
          url: n.url,
          publishedAt: new Date(n.datetime * 1000),
          summary: n.summary || undefined,
          source: n.source || undefined,
          imageUrl: n.image || undefined,
          symbols: [sym],
        },
        `Finnhub news for ${symbol}`,
      ),
    );
  } catch (error) {
    return mapFinnhubError(error, `fetchNews(${symbol})`);
  }
}

export async function finnhubIpoCalendar(
  get: FinnhubGet,
): Promise<IpoEvent[]> {
  try {
    const now = new Date();
    const to = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
    const data = await get<FinnhubIpoResponse>("/calendar/ipo", {
      from: ymd(now),
      to: ymd(to),
    });
    const items = data.ipoCalendar ?? [];
    return items.map((i) =>
      validateData(
        IpoEventSchema,
        {
          date: i.date,
          symbol: i.symbol || undefined,
          name: i.name || undefined,
          exchange: i.exchange || undefined,
          shares: i.numberOfShares ?? undefined,
          status: i.status || undefined,
        },
        "Finnhub IPO calendar",
      ),
    );
  } catch (error) {
    return mapFinnhubError(error, "fetchIpoCalendar");
  }
}

export async function finnhubSearch(
  get: FinnhubGet,
  query: string,
): Promise<SymbolSearchResult[]> {
  try {
    const data = await get<FinnhubSearchResponse>("/search", { q: query });
    const results = data.result ?? [];
    return results.slice(0, 25).map((r) =>
      validateData(
        SymbolSearchResultSchema,
        {
          symbol: r.symbol,
          name: r.description || undefined,
          type: r.type || undefined,
        },
        `Finnhub search for ${query}`,
      ),
    );
  } catch (error) {
    return mapFinnhubError(error, `searchSymbols(${query})`);
  }
}

export async function finnhubInsider(
  get: FinnhubGet,
  symbol: string,
): Promise<InsiderTransaction[]> {
  try {
    const sym = symbol.toUpperCase();
    const data = await get<FinnhubInsiderResponse>(
      "/stock/insider-transactions",
      { symbol: sym },
    );
    const items = data.data ?? [];
    return items.slice(0, 100).map((t) =>
      validateData(
        InsiderTransactionSchema,
        {
          symbol: sym,
          name: t.name || undefined,
          transactionDate: t.transactionDate || undefined,
          shares: t.share ?? undefined,
          change: t.change ?? undefined,
          price: t.transactionPrice ?? undefined,
          transactionType: t.transactionCode || undefined,
        },
        `Finnhub insider for ${symbol}`,
      ),
    );
  } catch (error) {
    return mapFinnhubError(error, `fetchInsiderTransactions(${symbol})`);
  }
}
