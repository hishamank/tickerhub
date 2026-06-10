# How to add a market data provider

This guide covers adding a new provider to `market-data-aggregator`. The system
selects providers per data type in priority order with automatic fallback, so a
new provider slots in once it's registered.

## Architecture recap

```
SmartAggregator.fetchX(symbol)
  → registry.getProvidersForDataType(type)   // built-in defaults + ConfigStore overrides
  → for each provider in priority order:
      → CredentialProvider.resolve(name)      // skip if a key is required but missing
      → ProviderFactory.create(name, creds)   // instantiate
      → ProviderExecutor.execute(...)         // circuit breaker + health + rate limit
      → return first non-empty result
```

A provider is a class extending `BaseProvider` that implements `fetchQuote`
(required) and any optional methods it supports (`fetchDividends`,
`fetchEarnings`, `fetchEvents`, `fetchRatings`, `fetchHistoricalPrices`,
`fetchOptionChain`, `fetchMacroIndicator`). Capability is declared via
`supportedDataTypes` — only implement the methods you list there.

## Steps

### 1. Create the provider class — `src/providers/<name>.ts`

```ts
import { BaseProvider } from "./base-provider.js";
import type { QuoteData, DataType, RateLimitConfig } from "../types/index.js";
import { QuoteDataSchema, validateData } from "../types/validation.js";

export class MyProvider extends BaseProvider {
  readonly name = "my-provider";
  readonly supportedDataTypes: DataType[] = ["prices"];
  readonly rateLimit: RateLimitConfig = { requestsPerMinute: 60 };

  constructor(private credentials: Record<string, string> | null) {
    super();
    // throw new ConfigurationError(...) if a required key is missing
  }

  async fetchQuote(symbol: string): Promise<QuoteData | null> {
    this.validateSymbol(symbol);
    // ...fetch, then map + validate:
    return validateData(QuoteDataSchema, mapped, `MyProvider quote for ${symbol}`);
  }
}
```

Keep the class thin (the 300-line `max-lines` rule is enforced): put response
interfaces in `<name>-types.ts` and pure transforms in `<name>-mappers.ts`, as
the finnhub/fmp/yahoo/alpha-vantage providers do. Use the shared
`validateSymbol` / `handleHttpError` from `provider-utils.ts` (BaseProvider
exposes them as protected helpers).

### 2. Export it — `src/providers/index.ts`

```ts
export { MyProvider } from "./my-provider.js";
```

### 3. Register in the factory — `src/providers/provider-factory.ts`

Add a `case` to the `switch` in `ProviderFactory.create`:

```ts
case "my-provider":
  return new MyProvider(credentials);
```

### 4. Add built-in defaults — `src/config/default-priorities.ts`

- Add an entry to `BUILTIN_PROVIDERS` (name, providerType, requiresKey,
  rate limits, reliabilityScore, paidTier, supportedDataTypes).
- Add the name to `DEFAULT_PROVIDER_PRIORITIES` for each data type it serves
  (order = priority).
- Add a `PROVIDER_RELIABILITY_SCORES` entry.

### 5. Map credentials (if the provider needs a key) — `src/adapters/credentials/provider-key-mapping.ts`

```ts
"my-provider": { apiKey: "MY_PROVIDER_API_KEY" },
// or, for key + secret:
"my-provider": { apiKey: "MY_PROVIDER_API_KEY", apiSecret: "MY_PROVIDER_API_SECRET" },
```

Add the env var(s) to `.env.example`. Keyless providers are omitted here.

### 6. Export from the public API — `src/index.ts`

Add `MyProvider` to the providers export block.

### 7. Test it — `src/providers/__tests__/my-provider.test.ts`

Stub `fetch` (`vi.stubGlobal("fetch", ...)`) and assert metadata, the happy
path, and error/empty paths. See `coingecko.test.ts` / `tiingo.test.ts` for the
pattern. Library-based providers (see `yahoo-finance.test.ts`) mock the SDK with
`vi.mock` + `vi.hoisted`.

## Verify

```bash
npm run check-types && npm run lint && npm test && npm run build
```
