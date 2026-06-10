import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FinnhubProvider } from "../finnhub.js";

const creds = { api_key: "test-key" };

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as Response;
}

describe("FinnhubProvider (fetch-based)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("requires an API key", () => {
    expect(() => new FinnhubProvider(null)).toThrow(/api key/i);
  });

  it("exposes correct metadata", () => {
    const p = new FinnhubProvider(creds);
    expect(p.name).toBe("finnhub");
    expect(p.supportedDataTypes).toContain("prices");
  });

  it("sends the API key as a header and maps a quote", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ c: 150, h: 151, l: 147, o: 148, pc: 149, t: 1_700_000_000 }),
    );
    const q = await new FinnhubProvider(creds).fetchQuote("AAPL");
    expect(q.price).toBe(150);
    expect(q.previousClose).toBe(149);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(
      (init.headers as Record<string, string>)["X-Finnhub-Token"],
    ).toBe("test-key");
  });

  it("throws SYMBOL_NOT_FOUND when the quote has no price", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ c: 0, h: 0, l: 0, o: 0, pc: 0, t: 0 }),
    );
    await expect(new FinnhubProvider(creds).fetchQuote("ZZZZ")).rejects.toThrow(
      /not found/i,
    );
  });

  it("maps dividends", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse([{ date: "2024-02-01", amount: 0.24, currency: "USD" }]),
    );
    const divs = await new FinnhubProvider(creds).fetchDividends!("AAPL");
    expect(divs).toHaveLength(1);
    expect(divs[0]?.amount).toBe(0.24);
  });

  it("maps a 429 on a wrapped call to a rate-limit error", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, false, 429));
    await expect(
      new FinnhubProvider(creds).fetchDividends!("AAPL"),
    ).rejects.toMatchObject({ retryable: true });
  });

  it("healthCheck returns true on success and false on error", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ c: 1, h: 1, l: 1, o: 1, pc: 1, t: 1 }),
    );
    expect(await new FinnhubProvider(creds).healthCheck()).toBe(true);

    fetchMock.mockRejectedValue(new Error("network"));
    expect(await new FinnhubProvider(creds).healthCheck()).toBe(false);
  });
});
