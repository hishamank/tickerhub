# Implementation plan: correctness pass + coverage expansion

> **Status: complete (shipped in v0.2.0).** All phases below are implemented,
> tested (297 tests), type-checked, lint-clean, and the tarball passes the
> package smoke test. One deviation from the plan: the `RateLimitStore` port is
> **synchronous** (both backends — in-memory Map and `better-sqlite3` — are sync),
> which avoided cascading `async` through the hot-path aggregator.

## Locked decisions

- **Aggregation = failover** (first provider in quality order that returns data
  wins). Not field-merge. Existing `tryProviders` logic stays.
- **Extend the fixed taxonomy** — add normalized `DataType`s; no endpoint-registry
  rewrite. Provider-unique endpoints become data types only one keyed provider
  serves, so they're auto-locked by the existing `requiresKey` skip.
- **Asset-class separation via namespaced sub-clients** — `service.*` for
  equities, `service.crypto.*`, `service.forex.*`. Each namespace exposes only
  the data types valid for it.
- **Persistence on SQLite** — a durable response cache (`SqliteCache` over the
  existing `Cache` port + SWR TTLs) and a durable rate-limit store (so
  monthly/daily budgets survive restarts). Both share one DB file with the
  existing config/health stores.
- **Coverage = all 9 new data types** (profile, news, ipo, search, insider,
  technicals, movers as equity; crypto + forex as separate namespaces).
- **Twelve Data + Marketstack** stay as last-resort fallbacks (kept at the bottom
  of priority lists, not removed).

Source research: [`PROVIDERS.md`](./PROVIDERS.md). Mechanics: [`../GUIDE.md`](../GUIDE.md).

Sequence: **P1 → P2 → P3 → P4 → P5**. Within P4, the equity types and the two
namespaces are independent and parallelizable.

---

## Phase 1 — Rate-limit correctness (no model change)

Pure data fixes. Low risk, ships immediately, stops live silent 429s.

1. Fix `BUILTIN_PROVIDERS` (`config/default-priorities.ts`):
   - `alpha-vantage`: `rateLimitPerDay` 500 → **25**.
   - `nasdaq-data-link`: `rateLimitPerDay` 50 → **50000**.
   - `marketstack`: interim daily proxy `rateLimitPerDay: 3` (≈90/mo) + `TODO(P2)`
     — replaced by a real monthly limit in P2.
2. Single source of truth: `PROVIDER_RATE_LIMITS` (`rate-limiting/rate-limit-config.ts`)
   is dead in the active path. **Recommendation: delete it + its `index.ts`
   export; `BUILTIN_PROVIDERS` is authoritative.** (Pre-1.0, so the export removal
   is an acceptable minor break; note in CHANGELOG.)
3. CoinGecko Demo key: add `coingecko: { apiKey: "COINGECKO_API_KEY" }` to
   `PROVIDER_ENV_MAPPING`; send `x-cg-demo-api-key` header in `CoinGeckoProvider`
   when set. Keep `requiresKey: false` (keyless still works, throttled).
4. `.env.example` += `COINGECKO_API_KEY` (optional). Tests for corrected limits.

**Acceptance:** corrected limits surface via `ProviderRegistry`; AV skipped after
25/day; Nasdaq no longer skipped early; one source of truth; tests green.

---

## Phase 2 — SQLite persistence + rate-limit model

The structurally invasive phase. Three pieces, all on one shared DB.

### 2a. `SqliteCache` — durable response cache
- New `adapters/sqlite/sqlite-cache.ts` implementing the `Cache` port
  (`get`/`set`/`deletePattern`). Table:
  ```sql
  CREATE TABLE IF NOT EXISTS cache_entries (
    key TEXT PRIMARY KEY, value TEXT NOT NULL, expires_at INTEGER
  );
  ```
  `set` upserts with `expires_at = now + ttlSeconds*1000`; `get` returns null past
  expiry; `deletePattern` maps glob `*` → SQL `LIKE %`. SWR staleness is unchanged
  (it lives in `SwrCache` + `ttl-config`; the Cache only does key/value/expiry).
- Plugs in via `createAggregator({ cache: new SqliteCache(db) })`. No core change.

### 2b. Per-hour / per-month / burst limit model
- Add `rateLimitPerHour` / `rateLimitPerMonth` to `BuiltinProviderMeta`
  (`default-priorities.ts`), `ProviderMetadata` (`provider-registry.ts`), and
  `ProviderConfigRecord` (`ports/config-store.ts`).
- `SQLITE_SCHEMA`: add columns via `ALTER TABLE provider_configs ADD COLUMN`
  (idempotent migration so existing DBs upgrade); map in `ConfigRow` +
  `getAllConfigs` + `upsertConfig`.

### 2c. `RateLimitStore` — durable budgets
- New port:
  ```ts
  interface RateLimitStore {
    consume(keyHash, provider, window): Promise<{ used: number }>;
    peek(keyHash, provider, window): Promise<{ used: number }>;
  }
  ```
  where `window` ∈ {minute, hour, day, month}.
- Refactor `RateLimitTracker` to delegate to a store (default
  `InMemoryRateLimitStore` = today's behavior; `SqliteRateLimitStore` optional).
  **Also refactor `record`/`isExhausted` to take a limits object** instead of
  positional `(min, day)` so the signature stops growing.
- `SqliteRateLimitStore` table:
  ```sql
  CREATE TABLE IF NOT EXISTS rate_limit_usage (
    key_hash TEXT, provider TEXT, window_type TEXT,
    window_start INTEGER, used INTEGER,
    PRIMARY KEY (key_hash, provider, window_type)
  );
  ```
- Thread a `rateLimitStore` option through `createAggregator` →
  `SmartAggregator` (the `rateLimitTracker` dep already exists; just feed it the
  store). `ProviderExecutor.isRateLimited`/`recordRateLimit` pass the new fields.

### 2d. Wire-up + data
- Extend `openSqliteStores` to also return `{ cache, rateLimitStore }` from the
  same `db`, so one file backs config + health + cache + rate limits.
- Populate hour/month limits: Tiingo (50/hr), Marketstack (100/mo), CoinGecko
  (10k/mo). Revert the P1 Marketstack daily proxy.
- Tests: SqliteCache get/set/expiry/pattern; window expiry + exhaustion across
  minute/hour/day/month; monthly budget survives a simulated restart.

**Acceptance:** with SQLite wired, response cache and monthly/daily budgets
persist across process restarts; a monthly-only provider is correctly skipped
when exhausted; in-memory remains the zero-config default; tests green.

---

## Phase 3 — Coverage template: ship `profile` end-to-end

Prove the repeatable "add a data type" path with company profile (broad free
coverage; TTL already wired as `getCompanyProfile`). Output = the checklist P4 repeats.

**Per-data-type checklist (reusable):**
1. **Shape** — return type in `types/data.ts` + Zod schema in `types/validation.ts`.
2. **Interface** — optional `fetchProfile?(symbol)` on `MarketDataProvider`; add
   `"profile"` to the `DataType` union.
3. **Selection** — `DEFAULT_PROVIDER_PRIORITIES.profile` list; set
   `supportedDataTypes` on the relevant `BUILTIN_PROVIDERS`.
4. **Providers** — implement only where free (profile: yahoo, finnhub, fmp,
   polygon, alpha-vantage). Watch the 300-line `max-lines` rule → extract to
   `<name>-types.ts` / `<name>-mappers.ts`.
5. **Aggregator** — add `fetchProfile` (singleton pattern, like `fetchRatings`).
6. **Service** — add `getCompanyProfile` (TTL exists).
7. **Export** the type from `index.ts`.
8. **Tests** — provider happy/empty/error + aggregator fallback.

**Resolve here:** `SmartAggregator` is near the `max-lines` ceiling and P4 adds
many methods. **Recommendation: split it into per-namespace aggregators** (equity
/ crypto / forex) sharing `tryProviders`, rather than raising the lint ceiling —
this also gives the namespaced sub-clients a clean home.

**Acceptance:** `service.getCompanyProfile("AAPL")` aggregates in priority order
with key-gating + rate-limit skipping, SWR-cached.

---

## Phase 4 — Fan out coverage

Each type follows the P3 checklist; only free providers are wired (see the F/P
matrix in `PROVIDERS.md`). Three independent tracks:

### 4A — Equity data types (top-level `service.*`)
- `news` (finnhub, fmp, polygon, alpha-vantage, tiingo, alpaca)
- `ipo` (finnhub, fmp, polygon, alpha-vantage)
- `search` (finnhub, fmp, polygon, alpha-vantage, twelve-data)
- `insider` (finnhub, fmp, polygon, alpha-vantage, yahoo)
- `technicals` (alpha-vantage, polygon, finnhub, twelve-data) — heaviest per
  provider; consider scoping to a core indicator set (SMA/EMA/RSI/MACD) first.
- `movers` (yahoo, polygon, alpha-vantage, alpaca, fmp)

### 4B — Crypto namespace (`service.crypto.*`)
- Introduce the **namespaced sub-client** infra: `CryptoService` wrapping the
  shared aggregator + SWR cache, exposed as `service.crypto`.
- Asset-class-scoped data types `crypto:quote`, `crypto:historical`,
  `crypto:markets` (keeps the `Record<DataType, string[]>` engine intact); new
  provider methods `fetchCryptoQuote`/`fetchCryptoHistorical`/`fetchCryptoMarkets`.
- Providers: coingecko, finnhub, polygon, alpha-vantage, tiingo.
- **Retire** the `tryProvidersForQuote` crypto special-case — crypto now routes
  through `service.crypto.getQuote()`. (Behavior change: `service.getQuote("BTC")`
  no longer auto-detects crypto; document in CHANGELOG.)

### 4C — Forex namespace (`service.forex.*`)
- Reuse the namespace infra from 4B for `ForexService` → `service.forex`.
- Data types `forex:rate`, `forex:historical`; methods `fetchForexRate`,
  `fetchForexHistorical`.
- Providers: finnhub, fmp, polygon, alpha-vantage, tiingo, twelve-data.

**Acceptance per type:** namespaced/typed service method returns aggregated data;
only free providers participate; tests cover fallback + empty.

---

## Phase 5 — Docs, examples, verification, release

1. README: capability table (link `PROVIDERS.md`); document the namespaced API
   and the SQLite cache + rate-limit wiring (`openSqliteStores`).
2. `GUIDE.md`: split "add a provider" vs "add a data type" (the P3 checklist) and
   "add an asset-class namespace".
3. `.env.example`: every keyed provider + optional `COINGECKO_API_KEY`.
4. `CHANGELOG.md`: corrected limits (breaking for old AV/Nasdaq numbers),
   `PROVIDER_RATE_LIMITS` removal, rate-limit model extension, SQLite cache +
   rate-limit store, namespaced asset-class API, the crypto-routing change.
5. `check-types && lint && test && test:coverage && build && verify:package`.
6. Minor version bump (behavior + API changes, pre-1.0).

---

## Summary

| Phase | Scope | Risk | Depends on |
|---|---|---|---|
| 1 | Fix stale limits, dedup source, CoinGecko key | low | — |
| 2 | SqliteCache + rate-limit model + SqliteRateLimitStore | **high** (ports, schema, tracker refactor) | 1 |
| 3 | `profile` template + aggregator split | low–med | 1, 2 |
| 4A | 6 equity data types | low each, repetitive | 3 |
| 4B | crypto namespace (+ retire special-case) | med (new sub-client infra) | 3 |
| 4C | forex namespace | low (reuses 4B infra) | 4B |
| 5 | docs + verify + release | low | 1–4 |

**Fastest value:** Phase 1 alone fixes live bugs. **Heaviest lift:** Phase 2
(persistence + model). **Coverage goal** is delivered by Phases 3–4.
</content>
