# Quickstart & Validation Guide

The TypeScript monorepo, local services, and Phase 1/2 foundations are
implemented. User-story features have not yet been started; the end-to-end
acceptance walkthrough below describes the target product behavior.

## Prerequisites

- Node.js 24 LTS and npm (included with Node.js).
- Docker Engine with Docker Compose.
- An OpenRouter API key and a model/provider configuration that supports strict
  structured output and tool calling. A mock AI adapter is used for automated
  tests; never put a real key in source control.

## Local Compose Environment

These steps use local PostgreSQL and Redis containers. If using the hosted
Neon and Upstash services instead, configure `.env` as described in the next
section and skip the local PostgreSQL and Redis containers.

1. Copy the example environment file and fill local-only values:

   ```powershell
   Copy-Item .env.example .env
   ```

2. Start local PostgreSQL, Redis, and MinIO:

   ```text
   docker compose up -d postgres redis minio minio-init
   ```

3. Install dependencies, apply Prisma migrations, and start the web app, API,
   and worker:

   ```text
   npm install
   npm run db:generate
   npm run db:migrate
   npm run dev
   ```

4. Confirm the web health page and API health endpoint respond. The browser
   accesses Express through same-origin `/api/v1` routing; it does not connect
   directly to PostgreSQL, Redis, or object storage.

Expected local service variables include `DATABASE_URL`, `MIGRATION_URL`,
`REDIS_URL`, `OBJECT_STORAGE_ENDPOINT`, `OBJECT_STORAGE_BUCKET`,
`OPENROUTER_API_KEY`, and session-cookie configuration. Use local Compose
credentials only.

## Hosted Neon and Upstash

1. In Neon, create the database and provision a least-privilege
   `flowpilot_app` role for runtime access, separate from the migration owner.
   The [database migration guide](../../packages/db/prisma/migrations/README.md)
   describes the role separation and grants.
2. Set `DATABASE_URL` to the Neon **direct** connection URL using
   `flowpilot_app`; set `MIGRATION_URL` to the **direct** URL using the
   migration role. Require TLS with `sslmode=require`. This project currently
   uses Prisma's standard PostgreSQL client, so use the direct Neon hostname
   (without `-pooler`). See the [Neon Prisma guide](https://neon.com/docs/guides/prisma)
   before changing to pooled connections.
3. In Upstash, create a Redis database and set `REDIS_URL` to its Redis
   protocol URL, for example
   `rediss://default:<TOKEN>@<ENDPOINT>:6379`. Use the TLS `rediss://` URL, not
   the Upstash REST URL or REST token; BullMQ requires the Redis protocol.
4. Store the real values only in `.env` or your deployment's secret manager.
   Do not commit credentials.

When using these hosted services, start only the object-storage service you
intend to use locally; the API and worker connect to Neon and Upstash through
`DATABASE_URL`, `MIGRATION_URL`, and `REDIS_URL`.

## Automated Checks

Run the unit checks now. Integration checks require the local PostgreSQL and
Redis services to be running, the initial migrations to be applied, and the
environment variables above to be configured:

```text
npm run typecheck
npm test
npm run test:integration
```

Expected results:

- `typecheck` checks every TypeScript app/package with strict settings and
  reports no undocumented `any`.
- `test` runs fast Vitest unit tests for Zod schemas, graph validation,
  workflow state transitions, and tool authorization.
- `test:integration` verifies tenant RLS and durable queue/outbox behavior.
  Approval, document-processing, and deletion integration coverage will be
  added with their user-story implementation phases.

## Target End-to-End Acceptance Walkthrough

These steps are not yet runnable; they become the acceptance flow as the
remaining user-story phases are implemented.

1. Register a user, create two workspaces, and verify that each workspace is
   visible only to its creator.
2. Upload a valid PDF, DOCX, or TXT file within 20 MB and 100 pages. Confirm
   the upload transitions to `ready`; try an unsupported/corrupt file and
   confirm it is rejected before a run can start.
3. Describe a document summary task. Inspect and edit the AI-proposed graph,
   save it, and confirm invalid nodes, edges, cycles, and unsupported actions
   are rejected by the server.
4. Start the workflow with an idempotency key. Verify step history, summary,
   dates, and action items are visible; repeat the same request and verify it
   does not create duplicate work.
5. Run a workflow that replaces an existing report. Verify the old report
   remains unchanged while approval is pending. Reject and confirm no replace;
   then run again, approve as the owner, and confirm the new report is saved.
6. Remove the source document. Verify the source, extracted text, linked report
   content, and pending report proposals are inaccessible and queued for
   deletion, while only content-free run status and safe error metadata remain.
7. Interrupt a worker during a run and verify BullMQ redelivery resumes from
   persisted step state without repeating completed steps or duplicating a
   report replacement.

The measured acceptance targets are in the feature spec's Success Criteria:
[spec.md](./spec.md). This guide does not prescribe a production availability
SLA, which remains a deployment planning decision.
