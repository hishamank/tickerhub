# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **FMP now uses the `/stable` API.** Every legacy `/api/v3` and `/api/v4` call
  moved to its stable endpoint, with mappers adapted to the flat stable payloads.
  FMP has retired the legacy paths for accounts created after August 2025.
  Ratings now come from `ratings-snapshot`, so `consensus` derives from FMP's
  1–5 score or letter grade. Earnings report `fiscalQuarter: "Unknown"` when the
  payload has no quarter, and `fiscalYear` approximates from the report date's
  calendar year when the payload has none.
- **Quota follows real requests.** FMP, Finnhub and Polygon now spend one unit
  per HTTP request, including failed ones, and are checked before each request,
  so a Polygon fallback or Finnhub price target cannot exceed the quota. Other
  providers still count one unit per call, now including failed calls, which
  uses local quota faster than before. Invalid-request rejections are not counted.
- **Plan denials are errors, not empty results.** A new non-retryable
  `ProviderErrorCode.ENTITLEMENT_REQUIRED` covers FMP 402/403 (carrying FMP's
  own message, including the legacy-endpoint notice), Finnhub 403, and Polygon
  403. Direct provider calls that used to resolve to `null`/`[]` on an FMP 403
  now reject. The aggregator still falls back to the next provider.
- Finnhub maps 401 and invalid-token bodies to `AUTHENTICATION_FAILED` and 429
  to a retryable `RATE_LIMIT_EXCEEDED`. Polygon maps 401 to
  `AUTHENTICATION_FAILED`, separately from a 403 plan denial.
- **Empty and failed results are no longer cached.** A `null` or `[]` aggregate
  is returned with `metadata.warnings` (including each provider's sanitized
  failure reason) and is retried on the next call. It never replaces good cached
  data. Genuinely empty symbols therefore re-query providers on each request.
- **Health is written through.** With a configured `healthStore`, every real
  provider attempt is persisted as it happens, so `flushHealthMetrics` is now
  optional. Prune with `deleteOlderThan`, as the store grows per attempt.
- `getProviderHealth` adds `provenance`: `observed`, or `registry-default` when
  the provider has no attempts in this process and the figures are placeholders.

### Added

- Polygon quotes fall back to the previous session's bar when the snapshot is
  denied by plan. These quotes are end-of-day data, labelled with
  `priceBasis: "end_of_day"`, `asOfDate` and `fallbackSource`, keep the bar's own
  timestamp, and omit `previousClose`/`change`/`changePercent`.

### Fixed

- List lookups (dividends, earnings, events, historical prices) now continue past
  a provider returning `[]` instead of stopping at it.
- Finnhub ratings keep the free recommendation data when the optional price
  target is denied by plan. Other price-target errors still propagate.
- `getProviderHealth` reported a provider with a 0% success rate as 100%.
- Circuit-breaker short-circuits no longer count as provider attempts in health.
- Plan denials count as failed attempts but no longer trip the circuit breaker,
  raise `consecutiveFailures`, or feed automatic-disable thresholds, so one
  unentitled endpoint cannot take down a provider's other endpoints.
- A provider that has only failed now reports its real elapsed latency, not 0.
- The FMP health check no longer logs the raw caught error, which could expose
  the API key carried in the request URL.
- API keys are redacted from provider error messages, logs, health records and
  response warnings.
- Twelve Data historical prices are returned oldest-first.
- Polygon volumes are rounded to integers across snapshot, historical and
  previous-day data.
- Accept Yahoo index, FX, and futures symbols (`^GSPC`, `^VIX`, `AED=X`,
  `GC=F`) and symbols up to 15 characters in shared validation and quote data.
- Reuse shared validation for Twelve Data while preserving slash-delimited
  pairs and rejecting unsupported punctuation.
- Map Yahoo earnings history months to integer fiscal quarters (`Q1`–`Q4`)
  while preserving the original EPS fields.

## [0.2.0] - 2026-06-12

Free-tier correctness pass plus a large coverage expansion: more normalized data
types, asset-class namespaces, and durable SQLite persistence.

### Added

- **New data types** aggregated across providers in priority order:
  `profile` (company fundamentals), `news`, `ipo` (calendar), `search`
  (symbol lookup), `insider` (transactions), `technicals` (indicators), and
  `movers` (gainers/losers/actives). New service methods: `getCompanyProfile`,
  `getNews`, `getIpoCalendar`, `searchSymbols`, `getInsiderTransactions`,
  `getTechnicalIndicator`, `getMarketMovers`.
- **Asset-class namespaces** on the service: `service.crypto.*`
  (`getQuote`/`getHistorical`/`getMarkets`) and `service.forex.*`
  (`getRate`/`getHistorical`). Each exposes only the data types valid for it,
  backed by the same selection/fallback engine and SWR cache.
- **Durable SQLite persistence**: `SqliteCache` (a `Cache`-port adapter for
  response caching) and `SqliteRateLimitStore` (a new `RateLimitStore` port) so
  daily/monthly budgets survive restarts. `openSqliteStores()` now returns
  `{ cache, rateLimitStore }` alongside the config/health stores, and
  `createAggregator` accepts a `rateLimitStore` option.
- **Per-hour and per-month rate-limit windows** (in addition to minute/day).
  `RateLimitConfig`'s `requestsPerHour`/`monthlyLimit` are now enforced via the
  registry and tracker. Tiingo (50/hr), Marketstack (100/mo), and CoinGecko
  (10k/mo) limits are now represented and honored.
- **CoinGecko Demo key** support (optional `COINGECKO_API_KEY`, sent as
  `x-cg-demo-api-key`); CoinGecko still works keyless (throttled harder).
- `docs/PROVIDERS.md`: a researched free-tier capability & rate-limit reference.

### Changed

- **Corrected free-tier rate limits** (these change provider-skip behavior):
  Alpha Vantage `500/day` → **`25/day`**, Nasdaq Data Link `50/day` →
  **`50,000/day`** (the authenticated free limit), Marketstack `100/day` →
  **`100/month`**.
- `service.getQuote()` is now **equities-only**; crypto symbols route through
  `service.crypto.getQuote()` (the old auto-detection special-case was removed).
- `SmartAggregator`'s generic provider-iteration loop was extracted into a
  shared `ProviderQueryEngine`.

### Removed

- **`PROVIDER_RATE_LIMITS` / `getRateLimitConfig`** (`rate-limiting/rate-limit-config`)
  — a second, drifted copy of the limits the aggregator never read.
  `BUILTIN_PROVIDERS` (via `ProviderRegistry`) is the single source of truth.

## [0.1.0] - 2026-06-11

Initial release — extracted from a monorepo into a standalone, dependency-
injected library.

### Added

- **Ports & adapters core**: `Logger`, `Cache`, `CredentialProvider`,
  `ConfigStore`, and `HealthMetricsStore` ports with zero-config in-memory /
  environment defaults.
- **`createAggregator()`** composition root wiring the full service graph.
- **12 providers**: Yahoo Finance, Finnhub, FMP, Polygon, Alpha Vantage,
  Tiingo, Twelve Data, Marketstack, Alpaca, Nasdaq Data Link, CoinGecko,
  Tradier — priority-ordered selection with automatic fallback.
- **SWR cache** with background refresh, request coalescing, and
  stale-on-error degradation.
- **Uniform resilience**: a per-provider circuit breaker on every call, plus
  per-key rate-limit quota tracking.
- **Health monitoring** with `flushHealthMetrics()` for durable time series.
- **Optional backends** via subpath exports: `/sqlite` (better-sqlite3) and
  `/redis` (ioredis), lazily loaded so the core install is dependency-free.
- Dual ESM + CJS build with type declarations; CI across Node 18/20/22.

### Security

- The Finnhub provider calls the REST API via native `fetch` instead of
  `finnhub-ts`, which transitively pinned an EOL `axios@0.27` with unpatched
  high-severity advisories. The package now has **zero** production dependency
  vulnerabilities (`npm audit --omit=dev`).

### Notes

- Repository/homepage/bugs URLs in `package.json` are placeholders — set them
  to the real remote before publishing.
