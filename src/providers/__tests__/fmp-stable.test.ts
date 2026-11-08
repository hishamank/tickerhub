/**
 * Regression tests for the FMP legacy → /stable migration.
 * All payloads are synthetic.
 */
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { FMPProvider } from "../fmp.js";

const KEY = "synthetic-fmp-key";
let fetchMock: ReturnType<typeof vi.fn>;

function ok(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as Response;
}
function requestedUrl(call = 0): URL {
  return new URL(String(fetchMock.mock.calls[call]?.[0]));
}
const provider = () => new FMPProvider({ api_key: KEY });

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

it("fetchQuote uses /stable/quote?symbol and maps changePercentage", async () => {
  fetchMock.mockResolvedValue(
    ok([
      {
        symbol: "AAPL",
        name: "Synthetic",
        price: 200,
        changePercentage: 1.5,
        change: 3,
        volume: 1000,
        dayLow: 198,
        dayHigh: 201,
        open: 199,
        previousClose: 197,
        timestamp: 1_700_000_000,
      },
    ]),
  );

  const quote = await provider().fetchQuote("aapl");

  expect(requestedUrl().pathname).toBe("/stable/quote");
  expect(requestedUrl().searchParams.get("symbol")).toBe("AAPL");
  expect(quote?.changePercent).toBe(1.5);
});

it("fetchDividends uses /stable/dividends?symbol and maps flat rows", async () => {
  fetchMock.mockResolvedValue(
    ok([
      {
        symbol: "AAPL",
        date: "2024-02-09",
        recordDate: "2024-02-12",
        paymentDate: "2024-02-15",
        declarationDate: "2024-02-01",
        adjDividend: 0.24,
        dividend: 0.24,
        yield: 0.5,
        frequency: "Quarterly",
      },
    ]),
  );

  const dividends = await provider().fetchDividends("AAPL");

  expect(requestedUrl().pathname).toBe("/stable/dividends");
  expect(requestedUrl().searchParams.get("symbol")).toBe("AAPL");
  expect(dividends).toHaveLength(1);
  expect(dividends[0]?.amount).toBe(0.24);
  expect(dividends[0]?.exDate.toISOString()).toContain("2024-02-09");
});

it("fetchProfile uses /stable/profile?symbol and maps marketCap", async () => {
  fetchMock.mockResolvedValue(
    ok([
      {
        symbol: "AAPL",
        companyName: "Synthetic Inc",
        marketCap: 2_000_000,
        exchange: "NASDAQ",
        exchangeFullName: "NASDAQ Global Select",
        fullTimeEmployees: "100",
      },
    ]),
  );

  const profile = await provider().fetchProfile("AAPL");

  expect(requestedUrl().pathname).toBe("/stable/profile");
  expect(requestedUrl().searchParams.get("symbol")).toBe("AAPL");
  expect(profile?.marketCap).toBe(2_000_000);
  expect(profile?.exchange).toBe("NASDAQ");
});

it("fetchRatings uses /stable/ratings-snapshot and maps the score, not the letter text", async () => {
  fetchMock.mockResolvedValue(
    ok([{ symbol: "AAPL", rating: "A-", overallScore: 4 }]),
  );

  const rating = await provider().fetchRatings("AAPL");

  expect(requestedUrl().pathname).toBe("/stable/ratings-snapshot");
  expect(requestedUrl().searchParams.get("symbol")).toBe("AAPL");
  expect(rating?.consensus).toBe("buy");
});

it("fetchRatings falls back to the letter grade when overallScore is absent", async () => {
  fetchMock.mockResolvedValue(ok([{ symbol: "AAPL", rating: "D+" }]));

  const rating = await provider().fetchRatings("AAPL");

  expect(rating?.consensus).toBe("strong_sell");
});

it("fetchNews uses /stable/news/stock?symbols", async () => {
  fetchMock.mockResolvedValue(
    ok([
      {
        symbol: "AAPL",
        publishedDate: "2024-02-01 10:00:00",
        title: "Synthetic headline",
        site: "example.test",
        text: "Body",
        url: "https://example.test/a",
      },
    ]),
  );

  const news = await provider().fetchNews("AAPL");

  expect(requestedUrl().pathname).toBe("/stable/news/stock");
  expect(requestedUrl().searchParams.get("symbols")).toBe("AAPL");
  expect(news[0]?.headline).toBe("Synthetic headline");
});

it("fetchIpoCalendar uses /stable/ipos-calendar", async () => {
  fetchMock.mockResolvedValue(
    ok([
      {
        symbol: "NEWCO",
        date: "2024-03-01",
        company: "New Co",
        exchange: "NASDAQ",
        actions: "Expected",
        shares: 1000,
      },
    ]),
  );

  const ipos = await provider().fetchIpoCalendar();

  expect(requestedUrl().pathname).toBe("/stable/ipos-calendar");
  expect(ipos[0]?.symbol).toBe("NEWCO");
});

it("searchSymbols uses /stable/search-symbol?query and maps the exchange code", async () => {
  fetchMock.mockResolvedValue(
    ok([
      {
        symbol: "AAPL",
        name: "Synthetic Inc",
        currency: "USD",
        exchangeFullName: "NASDAQ Global Select",
        exchange: "NASDAQ",
      },
    ]),
  );

  const results = await provider().searchSymbols("apple inc");

  expect(requestedUrl().pathname).toBe("/stable/search-symbol");
  expect(requestedUrl().searchParams.get("query")).toBe("apple inc");
  expect(results[0]?.exchange).toBe("NASDAQ");
});

it.each([
  ["gainers", "/stable/biggest-gainers"],
  ["losers", "/stable/biggest-losers"],
  ["actives", "/stable/most-actives"],
] as const)("fetchMarketMovers(%s) uses %s", async (direction, path) => {
  fetchMock.mockResolvedValue(
    ok([{ symbol: "AAPL", name: "Synthetic", price: 10, change: 1, changesPercentage: 2.5 }]),
  );

  const movers = await provider().fetchMarketMovers(direction);

  expect(requestedUrl().pathname).toBe(path);
  expect(movers[0]?.changePercent).toBe(2.5);
});

it("fetchMarketMovers accepts the stable changePercentage field name", async () => {
  fetchMock.mockResolvedValue(
    ok([{ symbol: "AAPL", price: 10, change: 1, changePercentage: 3.5 }]),
  );

  const movers = await provider().fetchMarketMovers("gainers");

  expect(movers[0]?.changePercent).toBe(3.5);
});

it("fetchForexRate uses /stable/quote?symbol with the concatenated pair", async () => {
  fetchMock.mockResolvedValue(ok([{ symbol: "EURUSD", price: 1.1 }]));

  const rate = await provider().fetchForexRate("eur", "usd");

  expect(requestedUrl().pathname).toBe("/stable/quote");
  expect(requestedUrl().searchParams.get("symbol")).toBe("EURUSD");
  expect(rate?.rate).toBe(1.1);
});

it("fetchHistoricalPrices uses /stable/historical-price-eod/full and flat rows", async () => {
  fetchMock.mockResolvedValue(
    ok([
      {
        symbol: "AAPL",
        date: "2024-01-03",
        open: 10,
        high: 12,
        low: 9,
        close: 11,
        volume: 500,
      },
    ]),
  );

  const prices = await provider().fetchHistoricalPrices(
    "AAPL",
    new Date("2024-01-01"),
    new Date("2024-01-05"),
  );

  expect(requestedUrl().pathname).toBe("/stable/historical-price-eod/full");
  expect(requestedUrl().searchParams.get("symbol")).toBe("AAPL");
  expect(requestedUrl().searchParams.get("from")).toBe("2024-01-01");
  expect(requestedUrl().searchParams.get("to")).toBe("2024-01-05");
  expect(prices.map((p) => p.close)).toEqual([11]);
});

it("fetchEarnings uses /stable/earnings?symbol and does not invent a quarter", async () => {
  fetchMock.mockResolvedValue(
    ok([
      {
        symbol: "AAPL",
        date: "2024-02-01",
        epsActual: 2.1,
        epsEstimated: 2,
        revenueActual: 100,
        revenueEstimated: 90,
      },
    ]),
  );

  const earnings = await provider().fetchEarnings("AAPL");

  expect(requestedUrl().pathname).toBe("/stable/earnings");
  expect(requestedUrl().searchParams.get("symbol")).toBe("AAPL");
  expect(earnings[0]).toMatchObject({
    fiscalQuarter: "Unknown",
    fiscalYear: 2024,
    estimate: 2,
    actual: 2.1,
    revenueEstimate: 90,
    revenueActual: 100,
  });
});

it("fetchInsiderTransactions uses /stable/insider-trading/search", async () => {
  fetchMock.mockResolvedValue(
    ok([
      {
        symbol: "AAPL",
        reportingName: "Synthetic Person",
        transactionDate: "2024-02-01",
        securitiesTransacted: 10,
        price: 100,
        transactionType: "S-Sale",
      },
    ]),
  );

  const tx = await provider().fetchInsiderTransactions("AAPL");

  expect(requestedUrl().pathname).toBe("/stable/insider-trading/search");
  expect(requestedUrl().searchParams.get("symbol")).toBe("AAPL");
  expect(tx[0]?.name).toBe("Synthetic Person");
});

it("healthCheck probes the stable quote endpoint, never a legacy path", async () => {
  fetchMock.mockResolvedValue(ok([]));

  await provider().healthCheck();

  expect(requestedUrl().pathname).toBe("/stable/quote");
});

const LEGACY_MESSAGE =
  "Legacy Endpoint : Due to Legacy endpoints being no longer supported - this endpoint is only available for legacy users.";

function denied(status: number, body: unknown): Response {
  return { ok: false, status, json: async () => body } as Response;
}

const range = [new Date("2024-01-01"), new Date("2024-01-05")] as const;
const everyFetch: Array<[string, (p: FMPProvider) => Promise<unknown>]> = [
  ["fetchQuote", (p) => p.fetchQuote("AAPL")],
  ["fetchDividends", (p) => p.fetchDividends("AAPL")],
  ["fetchEarnings", (p) => p.fetchEarnings("AAPL")],
  ["fetchRatings", (p) => p.fetchRatings("AAPL")],
  ["fetchHistoricalPrices", (p) => p.fetchHistoricalPrices("AAPL", ...range)],
  ["fetchProfile", (p) => p.fetchProfile("AAPL")],
  ["fetchNews", (p) => p.fetchNews("AAPL")],
  ["fetchIpoCalendar", (p) => p.fetchIpoCalendar()],
  ["searchSymbols", (p) => p.searchSymbols("apple")],
  ["fetchInsiderTransactions", (p) => p.fetchInsiderTransactions("AAPL")],
  ["fetchMarketMovers", (p) => p.fetchMarketMovers("gainers")],
  ["fetchForexRate", (p) => p.fetchForexRate("EUR", "USD")],
];

it.each(everyFetch)(
  "%s surfaces a 403 legacy message as a non-retryable entitlement error",
  async (_name, call) => {
    fetchMock.mockResolvedValue(
      denied(403, { "Error Message": LEGACY_MESSAGE }),
    );

    const error = await call(provider()).then(
      () => null,
      (e: unknown) => e,
    );

    expect(error).toMatchObject({
      code: "ENTITLEMENT_REQUIRED",
      retryable: false,
    });
    expect((error as Error).message).toContain("Legacy Endpoint");
  },
);

it("treats a 402 restricted-endpoint response as an entitlement error", async () => {
  fetchMock.mockResolvedValue(
    denied(402, { "Error Message": "Restricted Endpoint: upgrade your plan" }),
  );

  await expect(provider().fetchNews("AAPL")).rejects.toMatchObject({
    code: "ENTITLEMENT_REQUIRED",
    retryable: false,
  });
});

it("classifies a 200 legacy Error Message body as an entitlement error", async () => {
  fetchMock.mockResolvedValue(ok({ "Error Message": LEGACY_MESSAGE }));

  await expect(provider().fetchDividends("AAPL")).rejects.toMatchObject({
    code: "ENTITLEMENT_REQUIRED",
    retryable: false,
  });
});

it("treats a malformed non-array body as a retryable failure, not as no data", async () => {
  fetchMock.mockResolvedValue(ok({ unexpected: true }));

  await expect(provider().fetchEarnings("AAPL")).rejects.toMatchObject({
    code: "PROVIDER_ERROR",
    retryable: true,
  });
});

it("redacts the API key from an upstream error message", async () => {
  fetchMock.mockResolvedValue(
    denied(403, {
      "Error Message": `Legacy Endpoint : see /stable/quote?apikey=${KEY} (key ${KEY})`,
    }),
  );

  const error = await provider().fetchQuote("AAPL").catch((e: Error) => e);

  expect((error as Error).message).toContain("Legacy Endpoint");
  expect((error as Error).message).not.toContain(KEY);
});

it("redacts the API key from a network failure that echoes the URL", async () => {
  fetchMock.mockRejectedValue(
    new Error(`request to https://x.test/stable/news?apikey=${KEY} failed`),
  );

  const error = await provider().fetchNews("AAPL").catch((e: Error) => e);

  expect((error as Error).message).toContain("failed");
  expect((error as Error).message).not.toContain(KEY);
});
