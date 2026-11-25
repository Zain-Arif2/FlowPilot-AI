import { spawn } from "node:child_process";

const confirmation =
  "I_CONFIRM_THESE_ARE_DISPOSABLE_NON_PRODUCTION_SERVICES";
if (process.env.FLOWPILOT_TEST_CONFIRM_NON_PRODUCTION !== confirmation) {
  throw new Error(
    `Set FLOWPILOT_TEST_CONFIRM_NON_PRODUCTION=${confirmation} only for disposable test services.`,
  );
}

const testEnvironment = {
  FLOWPILOT_TEST_DATABASE_URL: "DATABASE_URL",
  FLOWPILOT_TEST_MIGRATION_URL: "MIGRATION_URL",
  FLOWPILOT_TEST_REDIS_URL: "REDIS_URL",
};
for (const [source, target] of Object.entries(testEnvironment)) {
  const value = process.env[source];
  if (!value) {
    throw new Error(`${source} is required for integration tests.`);
  }
  process.env[target] = value;
}

const vitest = spawn(
  process.execPath,
  [
    "./node_modules/vitest/vitest.mjs",
    "run",
    "--config",
    "vitest.integration.config.ts",
  ],
  { env: process.env, stdio: "inherit" },
);

vitest.once("error", (error) => {
  console.error("Could not start integration tests.", error);
  process.exitCode = 1;
});
vitest.once("exit", (code) => {
  process.exitCode = code ?? 1;
});
