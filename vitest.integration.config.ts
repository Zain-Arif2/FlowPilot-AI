import { defineConfig, mergeConfig } from "vitest/config";
import base from "./vitest.config.js";

export default mergeConfig(
  base,
  defineConfig({
    test: {
      include: [
        "apps/*/tests/**/*.integration.test.ts",
        "apps/worker/tests/durable-execution.test.ts",
        "packages/db/tests/tenant-isolation.test.ts",
      ],
      testTimeout: 30_000,
      hookTimeout: 30_000,
    },
  }),
);
