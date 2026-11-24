# Implementation Plan: Workflow Automation MVP

**Branch**: `001-workflow-automation` | **Date**: 2026-11-24 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-workflow-automation/spec.md`

## Summary

Build a TypeScript monorepo with a Next.js workflow-builder UI, an Express
business API, and a BullMQ worker. The API validates user and AI data through
shared Zod schemas, enforces workspace ownership in both application logic and
PostgreSQL RLS, and persists run state in Neon. Documents and extracted text
use private S3-compatible storage. OpenRouter returns structured workflow and
analysis results; only a server-owned, validated tool registry can perform
actions. PostgreSQL-backed execution state and an outbox make queue delivery,
retries, approval pauses, and document deletion recoverable.

## Technical Context

**Language/Version**: TypeScript in strict mode for web, API, worker, and shared
packages; Node.js 24 LTS.

**Primary Dependencies**: Next.js App Router, Express.js, Prisma, Zod,
`@xyflow/react`, `pdfjs-dist`, Mammoth, OpenRouter API, BullMQ, Redis, Vitest,
Supertest, Docker Compose.

**Storage**: Neon PostgreSQL for application data; Redis for BullMQ; private
S3-compatible object storage for source documents and derived extracted text.
Use local PostgreSQL, Redis, and MinIO for development and integration tests.

**Testing**: Vitest unit tests, Supertest API tests, PostgreSQL/Redis/MinIO
integration tests, strict TypeScript checking, and the acceptance walkthrough
in [quickstart.md](./quickstart.md).

**Target Platform**: Browser client plus containerized Node.js web, API, and
worker processes. Production hosting and object-store vendor are deployment
choices; Neon is the hosted PostgreSQL service.

**Project Type**: TypeScript monorepo web application: frontend, REST API,
background worker, and shared contracts/database packages.

**Performance Goals**: Meet SC-001 through SC-006 in the feature spec,
including 95% of valid documents up to 20 MB/100 pages producing a report
within 3 minutes and users finding run status within 30 seconds. AI-provider
latency is included in end-to-end measurements.

**Constraints**: English-only MVP; PDF, DOCX, and TXT up to 20 MB and 100 pages;
no OCR, external application connectors, team invitations, public report
publishing, loops, or user-authored code. Every graph action is predefined.
Replacing an existing report pauses for owner approval. Removing a document
deletes source and report content while retaining only content-free run/error
metadata.

**Scale/Scope**: One owner per workspace, multiple workspaces per user, and a
bounded workflow DAG (maximum 25 nodes and 60 edges). No production concurrency
or availability SLA is specified; deployment capacity targets require load
testing before production.

## Constitution Check

*Gate: evaluated before research and again after the design artifacts below.*

| Principle | Gate |
|---|---|
| Modular architecture | **PASS** — one web app, one API, one worker, and only shared contracts/database packages; no per-domain services. |
| Privacy and workspace isolation | **PASS** — ownership checks, workspace-scoped repositories, RLS, private object storage, and deletion cleanup. |
| Validate trust boundaries | **PASS** — Zod validation for requests, graph definitions, tool arguments, uploads, and AI outputs. |
| Approved AI tooling | **PASS** — fixed typed action registry; no model-generated code or dynamic capabilities. |
| Human approval | **PASS** — report replacement is persisted as pending and cannot commit before an owner decision. |
| TypeScript and conventions | **PASS** — strict TypeScript across all app code, shared inferred types, and documented `any` exceptions only. |
| Automated tests | **PASS** — unit, API, tenant-isolation, worker, and acceptance coverage is specified. |
| Reliability and observability | **PASS** — persisted state, transactional outbox, bounded retries, idempotency, and content-free structured events. |
| Performance and scalability | **PASS** — document and graph bounds are explicit; stateless API and queue workers can scale independently. |
| Simplicity | **PASS** — no external connectors, OCR, team roles, arbitrary code, or microservice-per-domain design. |

No constitution violations require an exception.

## Project Structure

### Documentation

```text
specs/001-workflow-automation/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── openapi.yaml
└── tasks.md                 # Created by /speckit-tasks, not by this command
```

### Source Code

```text
apps/
├── web/
│   ├── src/app/                         # Next.js routes and layouts
│   ├── src/features/
│   │   ├── auth/
│   │   ├── workspaces/
│   │   ├── documents/
│   │   ├── workflow-builder/            # React Flow client components
│   │   ├── executions/
│   │   └── reports/
│   ├── src/lib/api/                     # Same-origin API client
│   └── tests/
├── api/
│   ├── src/server.ts
│   ├── src/app.ts
│   ├── src/middleware/                  # Session, owner scope, CSRF, errors
│   ├── src/modules/
│   │   ├── auth/
│   │   ├── workspaces/
│   │   ├── documents/
│   │   ├── workflows/
│   │   ├── executions/
│   │   ├── approvals/
│   │   └── reports/
│   ├── src/adapters/                    # OpenRouter and object storage
│   └── tests/
└── worker/
    ├── src/main.ts
    ├── src/outbox/                      # Publish committed events to BullMQ
    ├── src/processors/                  # Validate documents and run workflows
    ├── src/workflow/                    # DAG runner and state transitions
    ├── src/tools/                       # Fixed, typed action registry
    └── tests/
packages/
├── shared/
│   └── src/
│       ├── schemas/                     # Zod schemas and inferred types
│       ├── workflow/                    # Graph validation and condition types
│       ├── api/                         # Stable error/request contracts
│       └── index.ts
└── db/
    ├── prisma/
    │   ├── schema.prisma
    │   └── migrations/                  # Includes reviewed RLS policies
    └── src/
        ├── client.ts
        ├── tenant-transaction.ts
        └── repositories/
package.json
package-lock.json
compose.yaml
tsconfig.base.json
```

**Structure Decision**: The repository has no application code or package
manifest. Start with an npm Workspaces monorepo. Keep domain modules inside one
Express API and one worker process; share only runtime schemas/types and the
Prisma data package. React Flow is isolated to the web feature module and its
serialized graph is validated again by the API/worker.

## Architecture Overview

### Request and API architecture

- Next.js renders the authentication/workspace shell and client-side React Flow
  editor. Browser requests use same-origin `/api/v1/*` routing to Express,
  avoiding browser-held database credentials and cross-site session cookies.
- Express owns the versioned REST API, authentication/session checks,
  workspace authorization, file-upload intents, workflow validation, OpenRouter
  requests, and database transactions. A centralized error mapper returns
  stable error codes and a request ID without stack traces or private payloads.
- The API contract is [contracts/openapi.yaml](./contracts/openapi.yaml).
  Shared Zod schemas are the runtime source of truth; OpenAPI changes must be
  reviewed with those schemas.
- Workflow updates use an expected revision to reject stale edits. Run creation
  requires an `Idempotency-Key`; IDs in a URL never substitute for ownership
  checks.

### AI integration

1. The proposal endpoint accepts a bounded prompt and optional ready
   `documentId`; it verifies owner scope and sends only the prompt/context
   needed to propose a workflow to an allowlisted OpenRouter model. Document
   analysis happens in its own validated workflow step.
2. Request strict JSON Schema output for a versioned workflow graph. If the
   selected provider/model does not support the needed schema/tool parameters,
   do not silently fall back to free-form output.
3. Parse model output with Zod, then run semantic checks: approved node kinds,
   bounded graph size, unique nodes, existing edge endpoints, acyclic graph,
   valid true/false condition branches, and references only to owned resources.
   Invalid output may receive one bounded repair attempt; if still invalid,
   return a user-visible error and do not save or execute it.
4. The user reviews/edits and confirms the workflow. Runtime tool calls are
   limited to the server-owned registry in `apps/worker/src/tools`; each call
   has an input schema, timeout, idempotency declaration, and approval policy.
   The model cannot access SQL, shell, arbitrary URLs, or user-provided code.
5. Treat document text as untrusted instructions. Limit prompt size/tokens,
   split long extracted text into bounded chunks, analyze chunks with
   rate-limited concurrency, and aggregate validated results into a typed
   summary/date/action-item report. OpenRouter is an external processor: use
   approved provider routing with data collection denied and zero-retention
   routing where available; never log prompts, extracted text, report bodies,
   or API keys.

### Workflow execution and approvals

- The saved graph is a DAG with at most 25 nodes and 60 edges. The runner
  supports the document extraction/analysis and report actions in the catalog,
  plus fixed condition operators; loops and arbitrary expression evaluation
  are rejected.
- Creating an execution, immutable workflow snapshot, initial step records,
  and outbox event is one Prisma transaction. The outbox dispatcher publishes
  identifier-only jobs to BullMQ. PostgreSQL is authoritative for state; Redis
  loss or duplicate delivery does not lose the run.
- A worker reloads the execution under its verified workspace context, skips
  completed steps, loading their validated output from private S3 artifacts
  referenced by workspace-scoped `ExecutionArtifact` rows. A worker writes an
  artifact before committing its reference and successful step/event
  transition, so a restart never needs to rerun a completed step. Artifacts
  remain private while the run is active or awaiting approval and are removed
  through the outbox when the run becomes terminal or its source document is
  deleted. Stable job IDs and database uniqueness prevent duplicate creation.
  Retry only transient, explicitly retryable work with bounded exponential
  backoff; manual retry creates a new attempt for an eligible failed step only.
- A report replacement creates private pending content and an owner approval.
  The existing report is unchanged while the execution is
  `waiting_approval`. Approve/reject is a one-time transaction; approval checks
  the target report revision and atomically replaces content only when that
  revision still matches. Approval detail retrieval is owner-authorized and
  identifies the action type, workspace, target report, expected revision, and
  proposed report content; approval list responses omit proposed content.
  Rejection discards the proposal. A stale revision returns a conflict,
  cancels the approval and execution, and leaves the current report unchanged.
  The decision writes an outbox continuation/cancellation event; no worker slot
  is held while waiting.
- All states and safe event metadata are persisted in PostgreSQL. BullMQ
  `QueueEvents` may inform UI updates, but clients read database-backed status.
  Logs include request/execution/step IDs, timing, outcome, and safe error codes
  only.

### Data and security architecture

- Prisma repositories accept an authenticated user context and, for tenant
  data, a verified workspace context. Every workspace-owned table has RLS;
  policies default deny when transaction-local context is missing. Runtime DB
  roles do not own tables or bypass RLS; migrations use a separate role.
- Use one shared Prisma client per long-running API/worker process. Runtime
  services use Neon's pooled endpoint; migrations use the direct endpoint.
  Tenant setting, RLS-protected queries, and writes stay in one transaction.
- Use Argon2id for passwords and random opaque server-side sessions whose hashes
  are stored in the database. Cookies are `HttpOnly`, `Secure`, and
  `SameSite=Lax`; validate origins/CSRF on mutations, rate-limit sign-in and
  AI endpoints, and return a generic invalid-credentials response.
- Keep object storage private. Uploads use random staging keys and short-lived
  URLs; the server verifies signature, byte size, supported type, and page
  count before marking a document ready. Parsing runs in the worker with size,
  time, and memory bounds. Scanned PDFs without text, encrypted files, and
  corrupt files fail clearly; OCR is out of scope.
- PDF files use native page count; DOCX/TXT use a fixed 300,000-character
  extracted-text budget as the equivalent of the spec's 100-page cap.
- Document removal revokes access immediately, deletes linked report and
  pending-proposal content, cancels pending approvals, and emits object cleanup
  through the outbox. It also removes private intermediate execution artifacts
  before purging document metadata. Worker results arriving after deletion are
  discarded.

### Testing and containerization

- Vitest unit tests cover workflow graph validation, Zod schemas, branch
  evaluation, safe-retry policy, authorization decisions, and AI response
  parsing using deterministic fixtures.
- Supertest runs the Express app in-process for authentication, request
  validation, stable errors, owner/workspace checks, and endpoint contracts.
- Integration tests use PostgreSQL with the same RLS migration, Redis/BullMQ,
  and MinIO. Verify cross-workspace denial, duplicate job delivery, worker
  restart recovery, approval pause/resume, safe retry, and document deletion.
- A small evaluation set checks OpenRouter output quality and the spec's
  document success criteria; it is opt-in and not part of deterministic unit
  tests.
- Docker Compose provides local Postgres, Redis, MinIO, and optional app
  containers. Build separate non-root web/API/worker images from the monorepo;
  inject secrets at runtime, never as image build arguments.

## Complexity Tracking

No constitution exceptions or unjustified architectural components are
identified. The worker, outbox, RLS, and private object store each address an
explicit requirement for durable execution, workspace isolation, or document
handling; no further service split is planned.
