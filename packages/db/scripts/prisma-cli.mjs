import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const migrationUrl = process.env.MIGRATION_URL;
if (!migrationUrl) {
  console.error("MIGRATION_URL is required for Prisma CLI commands.");
  process.exit(1);
}

const require = createRequire(import.meta.url);
const prismaCli = require.resolve("prisma/build/index.js");
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("A Prisma CLI command is required.");
  process.exit(1);
}

const result = spawnSync(
  process.execPath,
  [prismaCli, ...args, "--schema", "prisma/schema.prisma"],
  {
    cwd: new URL("..", import.meta.url),
    env: { ...process.env, DATABASE_URL: migrationUrl },
    stdio: "inherit",
  },
);

if (result.error) {
  console.error("Unable to start Prisma CLI:", result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
