import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    sqlite: "src/adapters/sqlite/index.ts",
    redis: "src/adapters/cache/redis/index.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
  target: "node18",
  // better-sqlite3 / ioredis are optional peers — never bundle them.
  external: ["better-sqlite3", "ioredis"],
});
