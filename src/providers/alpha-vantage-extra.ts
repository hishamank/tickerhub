/**
 * Alpha Vantage extended capabilities: technical indicators and forex (rate +
 * historical). Kept out of the provider class to respect the file-size cap.
 * Each function takes the provider's bound JSON getter.
 */

import type {
  TechnicalIndicator,
  ForexRate,
  HistoricalPrice,
} from "../types/index.js";
import {
  TechnicalIndicatorSchema,
  ForexRateSchema,
  validateData,
} from "../types/validation.js";

/** Bound Alpha Vantage getter: query params in, parsed JSON out. */
export type AvGet = <T>(params: Record<string, string>) => Promise<T>;

interface AvFxRate {
  "Realtime Currency Exchange Rate"?: {
    "5. Exchange Rate"?: string;
    "6. Last Refreshed"?: string;
    "8. Bid Price"?: string;
    "9. Ask Price"?: string;
  };
}

type AvFxDaily = Record<string, unknown> & {
  "Time Series FX (Daily)"?: Record<
    string,
    { "1. open": string; "2. high": string; "3. low": string; "4. close": string }
  >;
};

export async function avTechnicalIndicator(
  get: AvGet,
  symbol: string,
  indicator: string,
  interval: string = "daily",
): Promise<TechnicalIndicator | null> {
  const data = await get<Record<string, unknown>>({
    function: indicator.toUpperCase(),
    symbol: symbol.toUpperCase(),
    interval,
    time_period: "14",
    series_type: "close",
  });
  const key = Object.keys(data).find((k) => k.startsWith("Technical Analysis"));
  if (!key) return null;

  const series = data[key] as Record<string, Record<string, string>>;
  const values = Object.entries(series)
    .map(([date, obj]) => ({ date, value: parseFloat(Object.values(obj)[0] ?? "") }))
    .filter((v) => !Number.isNaN(v.value));
  if (values.length === 0) return null;

  return validateData(
    TechnicalIndicatorSchema,
    { symbol: symbol.toUpperCase(), indicator: indicator.toLowerCase(), interval, values },
    `Alpha Vantage ${indicator} for ${symbol}`,
  );
}

export async function avForexRate(
  get: AvGet,
  from: string,
  to: string,
): Promise<ForexRate | null> {
  const data = await get<AvFxRate>({
    function: "CURRENCY_EXCHANGE_RATE",
    from_currency: from.toUpperCase(),
    to_currency: to.toUpperCase(),
  });
  const r = data["Realtime Currency Exchange Rate"];
  const rate = r?.["5. Exchange Rate"];
  if (!r || rate == null) return null;

  const bid = r["8. Bid Price"];
  const ask = r["9. Ask Price"];
  return validateData(
    ForexRateSchema,
    {
      from: from.toUpperCase(),
      to: to.toUpperCase(),
      rate: parseFloat(rate),
      timestamp: r["6. Last Refreshed"]
        ? new Date(r["6. Last Refreshed"])
        : new Date(),
      bid: bid ? parseFloat(bid) : undefined,
      ask: ask ? parseFloat(ask) : undefined,
    },
    `Alpha Vantage forex rate ${from}/${to}`,
  );
}

export async function avForexHistorical(
  get: AvGet,
  from: string,
  to: string,
  start: Date,
  end: Date,
): Promise<HistoricalPrice[]> {
  const data = await get<AvFxDaily>({
    function: "FX_DAILY",
    from_symbol: from.toUpperCase(),
    to_symbol: to.toUpperCase(),
    outputsize: "compact",
  });
  const series = data["Time Series FX (Daily)"];
  if (!series) return [];

  const startMs = start.getTime();
  const endMs = end.getTime();
  return Object.entries(series)
    .filter(([date]) => {
      const t = new Date(date).getTime();
      return t >= startMs && t <= endMs;
    })
    .map(([date, o]) => ({
      date,
      open: parseFloat(o["1. open"]),
      high: parseFloat(o["2. high"]),
      low: parseFloat(o["3. low"]),
      close: parseFloat(o["4. close"]),
    }));
}
