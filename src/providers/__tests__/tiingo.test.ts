import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TiingoProvider } from "../tiingo.js";

const creds = { api_key: "test-key" };

describe("TiingoProvider", () => {
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
    expect(() => new TiingoProvider(null)).toThrow(/api key/i);
  });

  it("exposes correct metadata", () => {
    const p = new TiingoProvider(creds);
    expect(p.name).toBe("tiingo");
    expect(p.supportedDataTypes).toEqual(["prices", "dividends"]);
  });

  it("fetches and maps the latest quote", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [
        {
          date: "2024-01-02T00:00:00.000Z",
          close: 150,
          open: 148,
          high: 151,
          low: 147,
          adjClose: 149,
          volume: 1000,
        },
      ],
    } as Response);
    const q = await new TiingoProvider(creds).fetchQuote("AAPL");
    expect(q?.symbol).toBe("AAPL");
    expect(q?.price).toBe(150);
    expect(q?.previousClose).toBe(149);
  });

  it("throws SYMBOL_NOT_FOUND on an empty response", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [],
    } as Response);
    await expect(new TiingoProvider(creds).fetchQuote("ZZZZ")).rejects.toThrow(
      /not found/i,
    );
  });

  it("extracts dividends from the divCash field", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [
        { date: "2024-01-02T00:00:00.000Z", divCash: 0, close: 1 },
        { date: "2024-03-02T00:00:00.000Z", divCash: 0.24, close: 1 },
      ],
    } as Response);
    const divs = await new TiingoProvider(creds).fetchDividends!("AAPL");
    expect(divs).toHaveLength(1);
    expect(divs[0]?.amount).toBe(0.24);
  });
});
