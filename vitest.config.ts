import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    setupFiles: ["./vitest.setup.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        "src/**/__tests__/**",
        "src/**/index.ts",
        "src/types/**",
      ],
      // Floor set just below current levels to catch regressions without
      // failing on minor variance. Raise as coverage improves.
      thresholds: {
        statements: 60,
        branches: 70,
        functions: 70,
        lines: 60,
      },
    },
  },
});
