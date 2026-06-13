# Provider free-tier capability & rate-limit reference

> Researched June 2026 against official docs/pricing pages. Free tiers change
> often — re-verify before relying on a limit. Sources are footnoted per
> provider at the bottom.

This is the source-of-truth research behind `DEFAULT_PROVIDER_PRIORITIES` and the
per-provider rate limits. It documents, for each provider, **what its free tier
actually offers** and **what its real free rate limits are** — including several
that the code currently gets wrong.

## Legend

- **F** — available on the free tier
- **F\*** — free but caveated (delayed data, trial-symbols-only, tiny history, unstable, etc.)
- **P** — exists but paid-only
- **—** — not offered by this provider

## Capability matrix

Columns are the 12 built-in providers. Rows are normalized data categories;
the seven **bold** rows are the data types the taxonomy models *today*.

| Category | yahoo | finnhub | fmp | polygon | alpha-v | tiingo | 12data | mktstack | alpaca | nasdaq | coingk | tradier |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **prices/quote** | F\* | F | F\* | F\* | F\* | F | F\* | F\* | F\* | P | F\* | F |
| **historical-prices** | F | F\* | F\* | F\* | F\* | F | F\* | F\* | F | F\* | F\* | F |
| **dividends** | F | F | F | F | F | F | F\* | F | F | — | — | P |
| **earnings** | F | F | F | P | F | — | F\* | — | — | — | — | P |
| **ratings/analyst** | F | F | F | P | — | — | P | P | — | — | — | — |
| **events/splits** | F | F | F | F | F | F | F\* | F | F | — | — | P |
| **options** | F | P | P | F\* | P | — | — | — | F\* | — | — | **F** |
| **macro/economic** | — | F\* | F\* | F | F | — | — | — | — | F | — | — |
| news | F\* | F | F | F | F | F | — | — | F | — | — | — |
| company-profile/fundamentals | F | F | F | F | F\* | P | P | F\* | F\* | P | F | P |
| forex | F\* | F | F | F\* | F | F | F\* | F\* | — | — | F\* | — |
| crypto | F\* | F | F\* | F\* | F | F | F\* | — | F | F\* | F | — |
| insider-transactions | F | F | F | F | F | — | P | — | — | — | — | — |
| technical-indicators | — | F | P | F | F\* | — | F\* | — | — | — | — | — |
| ipo-calendar | — | F | F | F | F | — | F\* | — | — | — | — | P |
| sector/market (movers, status) | F | — | F | F | F | — | F\* | F | F | — | F | F |
| search/symbol-lookup | F | F | F | F | F | — | F | F | — | — | F | F |

**Reading it for the design:**
- Rows with many F's = "duplicate data" → priority-ordered failover (already built). The free leaders: prices, historical, dividends, events/splits.
- `options` is effectively **Tradier-unique** on the free tier (Polygon/Alpaca are delayed/indicative). It's already key-locked via `requiresKey`.
- `macro` free = Nasdaq (FRED), Alpha Vantage (broad), Polygon — not just Nasdaq as the code assumes.
- Categories with broad free coverage but **no taxonomy slot yet**: news, company-profile/fundamentals, forex, insider-transactions, technical-indicators, ipo-calendar, sector/market, search.

## Rate limits: researched vs. what the code uses

The aggregator enforces limits from `BUILTIN_PROVIDERS` (`rateLimitPerMinute` /
`rateLimitPerDay`). `PROVIDER_RATE_LIMITS` in `rate-limiting/rate-limit-config.ts`
is a **second, drifted copy that the active path never reads** — it should be
deleted or made the single source.

| Provider | Key? | Real free limits (2026) | Code `BUILTIN_PROVIDERS` | Verdict |
|---|---|---|---|---|
| yahoo-finance | no | Undocumented IP throttle; cookie/crumb breakage | `null / null` | OK (best-effort) |
| finnhub | key | 60/min **+ global 30/sec**; US-only | `60/min, day null` | OK; add 30/sec burst |
| fmp | key | 250/**day**, no per-min, 500MB/30d | `null/min, 250/day` | OK |
| polygon | key | 5/min, delayed, ~2yr | `5/min` | OK (now "Massive"-branded) |
| **alpha-vantage** | key | **25/day** + 5/min | `5/min, **500/day**` | ❌ **20× too high** — was 500, now 25 |
| tiingo | token | 50/**hour**, 1000/day, 500 symbols/mo, 1GB/mo | `null/min, 1000/day` | ⚠ missing hourly + monthly-symbol caps |
| twelve-data | key | 8/min, 800/day (credits; trial symbols only) | `8/min, 800/day` | OK; data scope caveat |
| **marketstack** | key | **100/MONTH**, EOD only, ≤1yr | `null/min, 100/**day**` | ❌ it's per-**month**, not per-day |
| alpaca | key+secret | 200/min, IEX feed only | `200/min` | OK |
| **nasdaq-data-link** | key | **50,000/day** with key (50/day only if keyless) | `null/min, **50/day**` | ❌ **1000× too low** for keyed use |
| **coingecko** | ~~no~~ key | Demo key now needed; 30/min **+ 10k/month** | `requiresKey:false, 30/min` | ⚠ now needs a Demo key; monthly cap unmodeled |
| tradier | token | 120/min prod, 60/min sandbox | `120/min` | OK |

### Structural limitation surfaced by the research

The rate-limit model only has **per-minute** and **per-day** fields. The real
free tiers also bind on **per-second** (Finnhub 30/s), **per-hour** (Tiingo 50/h),
and **per-month** (Marketstack 100/mo, CoinGecko 10k/mo, Tiingo 500 symbols/mo).
Marketstack and CoinGecko's true limits **cannot currently be represented**, so
the tracker can't actually protect them. `RateLimitConfig` already declares
`requestsPerHour` / `monthlyLimit` / `burstLimit` — but the registry and tracker
ignore them.

## Recommended taxonomy extensions

Given the "extend the fixed taxonomy" decision, these new `DataType`s are
justified by broad free coverage (each would aggregate across the listed
providers, same as the existing types):

| New data type | Free providers (priority order candidate) |
|---|---|
| `news` | finnhub, fmp, polygon, alpha-vantage, tiingo, alpaca |
| `profile` (company profile/fundamentals) | yahoo, finnhub, fmp, polygon, alpha-vantage |
| `forex` | finnhub, fmp, polygon, alpha-vantage, tiingo, twelve-data |
| `crypto` | coingecko, finnhub, polygon, alpha-vantage, tiingo |
| `insider` | finnhub, fmp, polygon, alpha-vantage, yahoo |
| `technicals` | alpha-vantage, polygon, finnhub, twelve-data |
| `ipo` | finnhub, fmp, polygon, alpha-vantage |
| `search` | finnhub, fmp, polygon, alpha-vantage, twelve-data |
| `movers` (sector/market) | yahoo, polygon, alpha-vantage, alpaca, coingecko, fmp |

`crypto` already exists informally (CoinGecko is special-cased in
`tryProvidersForQuote`); promoting it to a real data type would remove that
special case.

---

### Sources

- **Yahoo** (no official API; unstable): yahoo-finance2 npm + crumb/cookie issue tracker.
- **Finnhub**: finnhub.io/docs/api/rate-limit (60/min, global 30/sec, 429), finnhub.io/pricing.
- **FMP**: site.financialmodelingprep.com/pricing-plans + /faqs (250/day, 500MB/30d, EOD, ~5yr, US-only).
- **Polygon/Massive**: massive.com knowledge-base (5/min Basic, delayed, ~2yr); rebranded from polygon.io 2025-10-30 (api.polygon.io still valid).
- **Alpha Vantage**: alphavantage.co/support + /premium (25/day + 5/min; free was 500/day → 100 → 25 over 2023–24).
- **Tiingo**: tiingo.com/about/pricing (50/hr, 1000/day, 500 symbols/mo, 1GB/mo, non-commercial).
- **Twelve Data**: twelvedata.com/pricing + support trial article (8/min, 800/day credits, trial symbols).
- **Marketstack**: marketstack.com/pricing (100/month current; FAQ's 1000/mo is stale), EOD-only, ≤1yr.
- **Alpaca**: docs.alpaca.markets/us/docs/about-market-data-api + alpaca.markets/data (200/min, IEX feed, SIP paid).
- **Nasdaq Data Link**: docs.data.nasdaq.com/docs/rate-limits-1 (anon 50/day; authed free 50k/day; WIKI frozen ~2018).
- **CoinGecko**: coingecko.com/en/api/pricing + support article (Demo key, 30/min, 10k/month).
- **Tradier**: docs.tradier.com/docs/rate-limiting (120/min prod, 60/min sandbox; fundamentals are paid Beta).
</content>
