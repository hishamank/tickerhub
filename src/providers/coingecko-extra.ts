/**
 * CoinGecko extended capabilities (crypto historical OHLC + ranked markets).
 * Kept out of the provider class to respect the file-size cap. Each function
 * takes the provider's bound path getter (which prepends the base URL, paces
 * requests, and maps errors).
 */

import type { HistoricalPrice, CryptoMarket } from "../types/index.js";
import { CryptoMarketSchema, validateData } from "../types/validation.js";
import { getCoinGeckoId } from "../symbols/index.js";

/** Bound CoinGecko getter: an `/api/v3`-relative path in, parsed JSON out. */
export type CgGet = <T>(path: string) => Promise<T>;

type CoinGeckoOhlc = [number, number, number, number, number];

interface CoinGeckoMarket {
  symbol: string;
  name?: string;
  current_price: number;
  market_cap?: number;
  total_volume?: number;
  price_change_percentage_24h?: number;
  market_cap_rank?: number;
}

export async function coingeckoHistorical(
  get: CgGet,
  symbol: string,
  from: Date,
  to: Date,
): Promise<HistoricalPrice[]> {
  const id = getCoinGeckoId(symbol);
  if (!id) return [];
  const days = Math.max(
    1,
    Math.ceil((to.getTime() - from.getTime()) / 86_400_000),
  );
  const ohlc = await get<CoinGeckoOhlc[]>(
    `/coins/${id}/ohlc?vs_currency=usd&days=${days}`,
  );
  if (!Array.isArray(ohlc)) return [];
  return ohlc
    .map(([ts, o, h, l, c]) => ({
      date: new Date(ts).toISOString().split("T")[0]!,
      open: o,
      high: h,
      low: l,
      close: c,
    }))
    .filter((p) => {
      const t = new Date(p.date).getTime();
      return t >= from.getTime() - 86_400_000 && t <= to.getTime();
    });
}

export async function coingeckoMarkets(
  get: CgGet,
  limit: number,
): Promise<CryptoMarket[]> {
  const perPage = Math.min(Math.max(limit, 1), 250);
  const data = await get<CoinGeckoMarket[]>(
    `/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${perPage}&page=1`,
  );
  if (!Array.isArray(data)) return [];
  return data.map((m) =>
    validateData(
      CryptoMarketSchema,
      {
        symbol: m.symbol.toUpperCase(),
        name: m.name || undefined,
        price: m.current_price,
        marketCap: m.market_cap ?? undefined,
        volume24h: m.total_volume ?? undefined,
        change24h: m.price_change_percentage_24h ?? undefined,
        rank: m.market_cap_rank ?? undefined,
      },
      "CoinGecko markets",
    ),
  );
}
