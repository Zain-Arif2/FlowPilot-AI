# Database migration and roles

Run schema changes with `MIGRATION_URL` using the privileged migration role.
Application processes must use `DATABASE_URL` with a separate non-owner role
that has `NOBYPASSRLS`; do not use the migration credentials at runtime.

Provision the runtime and migration roles through the hosted database
provider's approved administrative workflow before applying migrations. Grant
the runtime role only the required schema/table/sequence privileges and ensure
it has `NOBYPASSRLS`. No credentials are stored in migration files.

The initial Prisma migration creates the schema. The following
`tenant_row_level_security` migration installs and forces default-deny policies
on every workspace-owned table. Review generated SQL and RLS policy changes
before applying them to a shared or production database.
