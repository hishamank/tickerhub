import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProviderErrorCode } from "../../types/provider.js";
import { MarketstackProvider } from "../marketstack.js";

describe("MarketstackProvider", () => {
  let originalFetch: typeof globalThis.fetch | undefined;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalFetch) {
      globalThis.fetch = originalFetch;
    }
  });

  it("normalizes latest EOD quote data", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        data: [
          {
            symbol: "VOD.L",
            open: 71.2,
            high: 72.5,
            low: 70.9,
            close: 72.1,
            volume: 1200000,
            date: "2026-03-28T00:00:00+0000",
          },
        ],
      }),
    } as unknown as Response);

    const provider = new MarketstackProvider({ api_key: "marketstack-key" });
    const quote = await provider.fetchQuote("vod.l");

    expect(quote).toEqual({
      symbol: "VOD.L",
      price: 72.1,
      open: 71.2,
      high: 72.5,
      low: 70.9,
      close: 72.1,
      volume: 1200000,
      timestamp: new Date("2026-03-28T00:00:00+0000"),
      currency: "USD",
    });
  });

  it("encodes access_key and symbols with URLSearchParams", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ data: [] }),
    } as unknown as Response);
    globalThis.fetch = fetchMock;

    const provider = new MarketstackProvider({ api_key: "key+with/slash==" });
    await provider.fetchQuote("BRK.B");

    const calledUrl = fetchMock.mock.calls[0]?.[0];
    expect(calledUrl instanceof URL).toBe(true);
    expect((calledUrl as URL).searchParams.get("access_key")).toBe(
      "key+with/slash==",
    );
    expect((calledUrl as URL).searchParams.get("symbols")).toBe("BRK.B");
  });

  it("returns null when the payload has no usable close price", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        data: [{ symbol: "AAPL", date: "2026-03-28T00:00:00+0000" }],
      }),
    } as unknown as Response);

    const provider = new MarketstackProvider({ api_key: "marketstack-key" });

    await expect(provider.fetchQuote("AAPL")).resolves.toBeNull();
  });

  it("maps payload auth errors to authentication failures", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        error: { message: "Your access key is invalid." },
      }),
    } as unknown as Response);

    const provider = new MarketstackProvider({ api_key: "bad-key" });

    await expect(provider.fetchQuote("AAPL")).rejects.toMatchObject({
      code: ProviderErrorCode.AUTHENTICATION_FAILED,
      retryable: false,
    });
  });

  it("maps HTTP 429 to a retryable rate limit error", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
    } as Response);

    const provider = new MarketstackProvider({ api_key: "marketstack-key" });

    await expect(provider.fetchQuote("AAPL")).rejects.toMatchObject({
      code: ProviderErrorCode.RATE_LIMIT_EXCEEDED,
      retryable: true,
    });
  });
});
