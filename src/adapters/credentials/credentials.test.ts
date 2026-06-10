import { describe, it, expect } from "vitest";
import { EnvCredentialProvider } from "./env-credential-provider.js";
import { ConfigCredentialProvider } from "./config-credential-provider.js";

describe("EnvCredentialProvider", () => {
  it("resolves a single-key provider from env", async () => {
    const cp = new EnvCredentialProvider({ FINNHUB_API_KEY: "fk" });
    expect(await cp.resolve("finnhub")).toEqual({ api_key: "fk" });
  });

  it("resolves api_key + api_secret for Alpaca", async () => {
    const cp = new EnvCredentialProvider({
      ALPACA_API_KEY: "ak",
      ALPACA_API_SECRET: "as",
    });
    expect(await cp.resolve("alpaca")).toEqual({
      api_key: "ak",
      api_secret: "as",
    });
  });

  it("normalizes provider aliases (underscore/hyphen, case)", async () => {
    const cp = new EnvCredentialProvider({ TWELVE_DATA_API_KEY: "td" });
    expect(await cp.resolve("twelve_data")).toEqual({ api_key: "td" });
    expect(await cp.resolve("Twelve-Data")).toEqual({ api_key: "td" });
  });

  it("returns null when the key is absent", async () => {
    const cp = new EnvCredentialProvider({});
    expect(await cp.resolve("finnhub")).toBeNull();
  });

  it("returns null for keyless / unknown providers", async () => {
    const cp = new EnvCredentialProvider({ FINNHUB_API_KEY: "fk" });
    expect(await cp.resolve("yahoo-finance")).toBeNull();
    expect(await cp.resolve("coingecko")).toBeNull();
  });

  it("omits api_secret when only the key is present", async () => {
    const cp = new EnvCredentialProvider({ ALPACA_API_KEY: "ak" });
    expect(await cp.resolve("alpaca")).toEqual({ api_key: "ak" });
  });
});

describe("ConfigCredentialProvider", () => {
  it("resolves from a static object with alias-insensitive lookup", async () => {
    const cp = new ConfigCredentialProvider({
      finnhub: { api_key: "fk" },
      "alpha_vantage": { api_key: "av" },
    });
    expect(await cp.resolve("finnhub")).toEqual({ api_key: "fk" });
    expect(await cp.resolve("alpha-vantage")).toEqual({ api_key: "av" });
  });

  it("returns null for unknown providers", async () => {
    const cp = new ConfigCredentialProvider({});
    expect(await cp.resolve("finnhub")).toBeNull();
  });
});
