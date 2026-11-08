/**
 * Regression tests for Finnhub HTTP status mapping and optional-entitlement
 * handling. All payloads are synthetic.
 */
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { FinnhubProvider } from "../finnhub.js";

let fetchMock: ReturnType<typeof vi.fn>;

function reply(status: number, body: unknown = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}
const provider = () => new FinnhubProvider({ api_key: "synthetic-finnhub-key" });

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

it("maps HTTP 401 to a non-retryable AUTHENTICATION_FAILED", async () => {
  fetchMock.mockResolvedValue(reply(401, { error: "Invalid API key" }));

  await expect(provider().fetchQuote("AAPL")).rejects.toMatchObject({
    code: "AUTHENTICATION_FAILED",
    retryable: false,
  });
});

it("maps HTTP 403 to a non-retryable ENTITLEMENT_REQUIRED carrying the upstream reason", async () => {
  fetchMock.mockResolvedValue(
    reply(403, { error: "You don't have access to this resource." }),
  );

  const error = await provider().fetchQuote("AAPL").catch((e: Error) => e);

  expect(error).toMatchObject({
    code: "ENTITLEMENT_REQUIRED",
    retryable: false,
  });
  expect((error as Error).message).toContain("don't have access");
});

it("maps HTTP 429 to a retryable RATE_LIMIT_EXCEEDED, including unwrapped calls", async () => {
  fetchMock.mockResolvedValue(reply(429));

  await expect(provider().fetchQuote("AAPL")).rejects.toMatchObject({
    code: "RATE_LIMIT_EXCEEDED",
    retryable: true,
    retryAfter: 60,
  });
});

it("treats a 403 whose body reports an invalid token as AUTHENTICATION_FAILED", async () => {
  fetchMock.mockResolvedValue(reply(403, { error: "Invalid API key" }));

  await expect(provider().fetchQuote("AAPL")).rejects.toMatchObject({
    code: "AUTHENTICATION_FAILED",
    retryable: false,
  });
});

it("treats a 200 body reporting an invalid token as AUTHENTICATION_FAILED", async () => {
  fetchMock.mockResolvedValue(reply(200, { error: "Invalid API key" }));

  await expect(provider().fetchDividends("AAPL")).rejects.toMatchObject({
    code: "AUTHENTICATION_FAILED",
    retryable: false,
  });
});

const recommendations = [
  { strongBuy: 2, buy: 8, hold: 0, sell: 0, strongSell: 0, period: "2024-02-01" },
];
function routePriceTarget(priceTarget: Response): void {
  fetchMock.mockImplementation(async (url: string) =>
    String(url).includes("/stock/recommendation")
      ? reply(200, recommendations)
      : priceTarget,
  );
}

it("keeps free recommendation data when the optional price target is 403", async () => {
  routePriceTarget(reply(403, { error: "You don't have access to this resource." }));

  const rating = await provider().fetchRatings("AAPL");

  expect(rating).toMatchObject({ consensus: "buy", numberOfAnalysts: 10 });
  expect(rating?.targetPrice).toBeUndefined();
});

it.each([
  [401, "AUTHENTICATION_FAILED"],
  [429, "RATE_LIMIT_EXCEEDED"],
  [500, "NETWORK_ERROR"],
])("does not swallow a %i from the optional price target", async (status, code) => {
  routePriceTarget(reply(status));

  await expect(provider().fetchRatings("AAPL")).rejects.toMatchObject({ code });
});
