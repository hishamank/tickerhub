/**
 * Regression: FMP's key travels in the URL, so a caught health-check error can
 * carry it in any field. Nothing logged may contain it. The key is synthetic.
 */
import { inspect } from "node:util";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const log = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));
vi.mock("../../logging/index.js", () => ({ getLogger: () => log }));

import { FMPProvider } from "../fmp.js";

const SECRET = "synthetic-fmp-secret";
const KEYED_URL = `https://financialmodelingprep.com/stable/quote?symbol=AAPL&apikey=${SECRET}`;

/** Everything logged, including non-enumerable fields such as stack and cause. */
const logged = () =>
  inspect(log.error.mock.calls, { showHidden: true, depth: 12 });

async function healthCheckThrowing(thrown: unknown): Promise<boolean> {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(thrown));
  return new FMPProvider({ api_key: SECRET }).healthCheck();
}

beforeEach(() => log.error.mockClear());
afterEach(() => vi.unstubAllGlobals());

it("redacts a keyed URL in the error message, field and stack", async () => {
  const error = Object.assign(new Error(`GET ${KEYED_URL} failed`), {
    url: KEYED_URL,
    config: { url: KEYED_URL },
  });

  expect(await healthCheckThrowing(error)).toBe(false);

  expect(log.error).toHaveBeenCalledTimes(1);
  expect(logged()).toContain("failed"); // the diagnosis survives
  expect(logged()).not.toContain(SECRET);
});

it("redacts a bare key that does not appear as a query parameter", async () => {
  await healthCheckThrowing(new Error(`upstream rejected ${SECRET} outright`));

  expect(logged()).toContain("rejected");
  expect(logged()).not.toContain(SECRET);
});

it("redacts the key from an error's cause chain while keeping the reason", async () => {
  const error = new Error("fetch failed", {
    cause: new Error(`ECONNREFUSED while calling ${KEYED_URL}`),
  });

  await healthCheckThrowing(error);

  expect(logged()).toContain("ECONNREFUSED");
  expect(logged()).not.toContain(SECRET);
});

it("redacts the key from a thrown non-Error value", async () => {
  await healthCheckThrowing(`raw failure ${SECRET}`);

  expect(logged()).toContain("raw failure");
  expect(logged()).not.toContain(SECRET);
});
