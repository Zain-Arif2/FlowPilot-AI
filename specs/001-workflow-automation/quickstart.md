# Quickstart & Validation Guide

The TypeScript monorepo and the authentication, document workflow, visual
builder, approval, and execution-history code paths are implemented. Integration
and end-to-end acceptance remain incomplete; the walkthrough below is the
manual verification procedure, not a claim that those steps have passed.

## Prerequisites

- Node.js 24 LTS and npm (included with Node.js).
- A Neon PostgreSQL database, an Upstash Redis database, and private
  S3-compatible object storage.
- An OpenRouter API key and an approved model/provider configuration (default:
  `google/gemini-2.5-flash-lite`) that supports strict structured output and
  zero-retention routing. Automated tests use a mock AI adapter; never put a
  real key in source control.

## Hosted Services

1. Copy the environment template:

   ```powershell
   Copy-Item .env.example .env
   ```

2. Set `DATABASE_URL` to Neon’s direct connection URL using a least-privilege
   runtime role with `NOBYPASSRLS`. Set `MIGRATION_URL` to the direct URL for a
   separate migration role. Require TLS with `sslmode=require`; this Prisma
   setup uses the direct Neon host, not the `-pooler` host.
3. Set `REDIS_URL` to Upstash’s TLS Redis protocol URL (`rediss://`). BullMQ
   does not use the Upstash REST URL or REST token.
4. Configure a private S3-compatible bucket and its endpoint, region, access
   key, and secret. The endpoint must be reachable by browsers for short-lived
   signed uploads.
5. Add the OpenRouter credentials, `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`
   (at least 32 characters each, distinct), and set `APP_ORIGIN` to the local
   web origin. Keep `COOKIE_SECURE=false` for local HTTP only; use `true` behind
   HTTPS in deployment (which enables `__Host-` cookie prefixes). Store real
   values only in `.env` or a secret manager.
6. Install dependencies, generate Prisma Client, apply checked-in migrations,
   and start the web app, API, and worker:

   ```text
   npm install
   npm run db:generate
   npm run db:migrate:deploy
   npm run dev
   ```

7. Confirm the web health page and API health endpoint respond. The browser
   accesses Express through same-origin `/api/v1` routing; it does not connect
   directly to PostgreSQL, Redis, or object storage.

For production, build each workspace and start the web app, API, and worker as
separate Node.js processes under the hosting platform's process manager. Inject
all provider credentials at runtime; do not copy `.env` into a deployment
artifact:

```text
npm run build --workspace=@flowpilot/web
npm run build --workspace=@flowpilot/api
npm run build --workspace=@flowpilot/worker
npm run start --workspace=@flowpilot/web
npm run start --workspace=@flowpilot/api
npm run start --workspace=@flowpilot/worker
```

The API `/api/v1/readyz` endpoint checks PostgreSQL and Redis availability.
Worker startup verifies its PostgreSQL and Redis connections before it begins
processing jobs.

The [database migration guide](../../packages/db/prisma/migrations/README.md)
describes role separation. See the [Neon Prisma guide](https://neon.com/docs/guides/prisma)
before changing from direct connections to pooled connections.

## Automated Checks

The following checks passed on 2026-11-25:

```text
npm run typecheck             # all workspaces
npm run lint
npm test                      # 25 test files, 82 tests
npm run build --workspace=@flowpilot/api
npm run build --workspace=@flowpilot/worker
npm run build --workspace=@flowpilot/web
```

The API contract YAML parsed successfully as OpenAPI 3.1.0. Redocly lint passed
with two non-blocking warnings: the API info section has no license field, and
the health endpoint has no 4xx response. The Next.js build reports a
non-blocking warning that its ESLint plugin is not configured.

The synthetic 20 MB / 100-page PDF extraction benchmark passed in 458 ms in
this run. This measures parsing only; the end-to-end three-minute report target
has not been measured. A final source review checked tenant RLS, API ownership
gates, private object-key scope and deletion, worker authorization, and log
redaction. Database-backed policy behavior still needs isolated integration
testing.

Do not run `npm run test:integration` against production or shared Neon,
Upstash, or object-storage resources. Use a separate, disposable non-production
database, Redis instance, and bucket with test-only credentials. No hosted
integration services were provisioned for this validation, so the
database-backed integration tests were not run. The integration runner requires
`FLOWPILOT_TEST_CONFIRM_NON_PRODUCTION` and `FLOWPILOT_TEST_DATABASE_URL`,
`FLOWPILOT_TEST_MIGRATION_URL`, and `FLOWPILOT_TEST_REDIS_URL`; it deliberately
does not fall back to the ordinary application URLs.

## Target End-to-End Acceptance Walkthrough

The product code paths exist, but this walkthrough has not been run end to end.
Run it only with isolated test credentials and non-production hosted services;
do not use production data:

1. Register a user, create two workspaces, and verify that each workspace is
   visible only to its creator.
2. Upload a valid PDF, DOCX, or TXT file within 20 MB and 100 pages. Confirm
   the upload transitions to `ready`; try an unsupported/corrupt file and
   confirm it is rejected before a run can start.
3. Describe a document summary task. Inspect and edit the AI-proposed graph in
   the visual builder, save it, and confirm invalid nodes, edges, cycles, and
   unsupported actions are rejected by the server.
4. Start the workflow with an idempotency key. Verify step history, safe event
   details, summary, dates, and action items are visible; repeat the same
   request and verify it does not create duplicate work.
5. Run a workflow that replaces an existing report. Verify the old report
   remains unchanged while approval is pending. Reject and confirm no replace;
   then run again, approve as the owner, and confirm the new report is saved.
6. Remove the source document. Verify the source, extracted text, linked report
   content, and pending report proposals are inaccessible and queued for
   deletion, while only content-free run status and safe error metadata remain.
7. Interrupt a worker during a run and verify BullMQ redelivery resumes from
   persisted step state without repeating completed steps or duplicating a
   report replacement. Verify manual retry is offered only for transient
   failures in repeatable steps.

The measured acceptance targets are in the feature spec's Success Criteria:
[spec.md](./spec.md). This guide does not prescribe a production availability
SLA, which remains a deployment planning decision.
