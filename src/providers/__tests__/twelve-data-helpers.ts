/**
 * Shared test helpers and fixtures for Twelve Data provider tests.
 *
 * Note: vi.mock factories cannot reference imports (they are hoisted),
 * so mock objects for @repo/logger and @repo/errors must be inlined
 * directly in each test file's vi.mock() call.
 */

export const VALID_CREDENTIALS = { api_key: "test-api-key-123" };

/** Helper to create a mock Response */
export function mockResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    headers: new Headers(),
    statusText: status === 200 ? "OK" : "Error",
  } as Response;
}

/** Sample stock quote response from Twelve Data */
export const stockQuoteResponse = {
  symbol: "AAPL",
  name: "Apple Inc",
  exchange: "NASDAQ",
  currency: "USD",
  open: "178.50",
  high: "180.25",
  low: "177.80",
  close: "179.90",
  volume: "52341000",
  previous_close: "178.10",
  change: "1.80",
  percent_change: "1.01",
  timestamp: 1700000000,
};

/** Sample time_series response from Twelve Data */
export const timeSeriesResponse = {
  meta: {
    symbol: "AAPL",
    interval: "1day",
    currency: "USD",
  },
  values: [
    {
      datetime: "2024-01-05",
      open: "180.00",
      high: "182.00",
      low: "179.00",
      close: "181.50",
      volume: "50000000",
    },
    {
      datetime: "2024-01-04",
      open: "178.00",
      high: "180.50",
      low: "177.00",
      close: "179.80",
      volume: "48000000",
    },
  ],
};
