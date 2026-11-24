import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["apps/*/tests/**/*.test.ts", "packages/*/tests/**/*.test.ts"],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "apps/worker/tests/durable-execution.test.ts",
      "packages/db/tests/tenant-isolation.test.ts",
    ],
    coverage: {
      provider: "v8",
      include: ["apps/*/src/**/*.ts", "packages/*/src/**/*.ts"],
      exclude: ["**/index.ts", "**/*.d.ts"],
      reporter: ["text", "lcov"],
    },
  },
});
