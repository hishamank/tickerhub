/**
 * Regression tests for Polygon credential vs entitlement handling, the EOD quote
 * fallback, and integer volumes. All payloads are synthetic.
 */
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PolygonProvider } from "../polygon.js";

let fetchMock: ReturnType<typeof vi.fn>;

function reply(status: number, body: unknown = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}
const provider = () => new PolygonProvider({ api_key: "synthetic-polygon-key" });
const calledPath = (call: number) =>
  new URL(String(fetchMock.mock.calls[call]?.[0])).pathname;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

it("maps 401 to AUTHENTICATION_FAILED and 403 to ENTITLEMENT_REQUIRED", async () => {
  fetchMock.mockResolvedValueOnce(reply(401));
  await expect(provider().fetchDividends("AAPL")).rejects.toMatchObject({
    code: "AUTHENTICATION_FAILED",
    retryable: false,
  });

  fetchMock.mockResolvedValueOnce(reply(403));
  await expect(provider().fetchDividends("AAPL")).rejects.toMatchObject({
    code: "ENTITLEMENT_REQUIRED",
    retryable: false,
  });
});

const prevBar = {
  T: "AAPL",
  o: 180,
  h: 183,
  l: 179,
  c: 182,
  v: 1200,
  t: 1_711_584_000_000, // 2024-03-28
};

it("falls back to the prev-day bar on a snapshot entitlement denial, labelled as EOD", async () => {
  fetchMock
    .mockResolvedValueOnce(reply(403))
    .mockResolvedValueOnce(reply(200, { results: [prevBar] }));

  const quote = await provider().fetchQuote("aapl");

  expect(calledPath(0)).toContain("/v2/snapshot/");
  expect(calledPath(1)).toBe("/v2/aggs/ticker/AAPL/prev");
  expect(quote).toMatchObject({
    symbol: "AAPL",
    price: 182,
    close: 182,
    open: 180,
    high: 183,
    low: 179,
    volume: 1200,
    priceBasis: "end_of_day",
    asOfDate: "2024-03-28",
    fallbackSource: "polygon:/v2/aggs/ticker/{ticker}/prev",
  });
  // The bar's own time, never "now"; and it has no prior close to compare with.
  expect(quote?.timestamp).toEqual(new Date(prevBar.t));
  expect(quote?.previousClose).toBeUndefined();
  expect(quote?.change).toBeUndefined();
  expect(quote?.changePercent).toBeUndefined();
});

it.each([401, 429, 500])("does not fall back to EOD on a %i", async (status) => {
  fetchMock.mockResolvedValue(reply(status));

  await expect(provider().fetchQuote("AAPL")).rejects.toBeDefined();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("a live snapshot quote carries no end-of-day label", async () => {
  fetchMock.mockResolvedValue(
    reply(200, { ticker: { day: { c: 10, v: 5 }, prevDay: { c: 9 }, updated: 1_711_584_000_000 } }),
  );

  const quote = await provider().fetchQuote("AAPL");

  expect(quote?.priceBasis).toBeUndefined();
  expect(quote?.fallbackSource).toBeUndefined();
});

it("rounds fractional snapshot volume to an integer", async () => {
  fetchMock.mockResolvedValue(
    reply(200, { ticker: { day: { c: 10, v: 1234.6 }, updated: 1_711_584_000_000 } }),
  );

  expect((await provider().fetchQuote("AAPL"))?.volume).toBe(1235);
});

it("rounds fractional historical volume to an integer", async () => {
  fetchMock.mockResolvedValue(
    reply(200, { results: [{ t: 1_711_584_000_000, c: 10, v: 99.5 }] }),
  );

  const prices = await provider().fetchHistoricalPrices(
    "AAPL",
    new Date("2024-03-28"),
    new Date("2024-03-29"),
  );

  expect(prices[0]?.volume).toBe(100);
});

it("rounds fractional prev-day volume to an integer", async () => {
  fetchMock
    .mockResolvedValueOnce(reply(403))
    .mockResolvedValueOnce(reply(200, { results: [{ ...prevBar, v: 1200.4 }] }));

  expect((await provider().fetchQuote("AAPL"))?.volume).toBe(1200);
});
