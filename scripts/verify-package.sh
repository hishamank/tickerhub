#!/usr/bin/env bash
#
# Verify the published package works end-to-end: build, pack, install the
# tarball into a clean throwaway project, then exercise the CJS, ESM, and
# subpath (/sqlite, /redis) entry points. This is the only true test that
# `exports`, `files`, and the dual build are correct for real consumers.
#
# Usage: npm run verify:package
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "▸ Building…"
npm run build >/dev/null

echo "▸ Packing…"
TARBALL="$ROOT/$(npm pack 2>/dev/null | tail -1)"
trap 'rm -f "$TARBALL"' EXIT

TMP="$(mktemp -d)"
trap 'rm -f "$TARBALL"; rm -rf "$TMP"' EXIT
cd "$TMP"

echo "▸ Installing tarball into a clean project…"
npm init -y >/dev/null 2>&1
npm install "$TARBALL" better-sqlite3 >/dev/null 2>&1

echo "▸ CJS require…"
node -e '
const { createAggregator, NoopLogger } = require("market-data-aggregator");
const { service } = createAggregator({ logger: new NoopLogger() });
service.getRegisteredProviders().then((p) => {
  if (p.length < 12) { console.error("expected >= 12 providers"); process.exit(1); }
  console.log("  CJS OK (" + p.length + " providers)");
});
'

echo "▸ ESM import + subpaths…"
cat > verify.mjs <<'EOF'
import { createAggregator, InMemoryCache, NoopLogger } from "market-data-aggregator";
import { openSqliteStores } from "market-data-aggregator/sqlite";
import { RedisCache } from "market-data-aggregator/redis";

const { configStore, healthStore, db } = await openSqliteStores(":memory:");
const { service } = createAggregator({
  logger: new NoopLogger(),
  cache: new InMemoryCache(),
  configStore,
  healthStore,
});
const providers = await service.getRegisteredProviders();
if (providers.length < 12) { console.error("expected >= 12 providers"); process.exit(1); }
if (typeof RedisCache !== "function") { console.error("RedisCache missing"); process.exit(1); }
db.close();
console.log("  ESM + /sqlite + /redis OK");
EOF
node verify.mjs

echo "✓ Package verification passed"
