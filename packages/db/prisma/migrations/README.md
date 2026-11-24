# Database migration and roles

Run schema changes with `MIGRATION_URL` using the privileged migration role.
Application processes must use `DATABASE_URL` with a separate non-owner role
that has `NOBYPASSRLS`; do not use the migration credentials at runtime.

The local Compose bootstrap creates `flowpilot_app` with the password supplied
through `FLOWPILOT_APP_PASSWORD` and grants it access to objects created by the
local migration role. Hosted databases must provision the equivalent roles
through the provider's approved administrative workflow before applying
migrations. No credentials are stored in migration files.

The initial Prisma migration creates the schema. The following
`tenant_row_level_security` migration installs and forces default-deny policies
on every workspace-owned table. Review generated SQL and RLS policy changes
before applying them to a shared or production database.
