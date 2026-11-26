# Tasks: Workflow Automation MVP

**Input**: Design documents from `/specs/001-workflow-automation/`

**Prerequisites**:
[plan.md](./plan.md),
[spec.md](./spec.md),
[research.md](./research.md),
[data-model.md](./data-model.md),
[contracts/openapi.yaml](./contracts/openapi.yaml),
[quickstart.md](./quickstart.md)

**Tests**: Unit, API, integration, and security test tasks are included because they are required by the constitution and implementation requirements.

**Organization**: Tasks are grouped by user story so each story can be implemented and verified independently.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Initialize the TypeScript monorepo and local runtime.

- [X] T001 Create the npm Workspaces structure and root configuration in `package.json`, `package-lock.json`, `tsconfig.base.json`, and `.gitignore`
- [X] T002 [P] Create the Next.js TypeScript application scaffold in `apps/web/`
- [X] T003 [P] Create the Express TypeScript API scaffold in `apps/api/`
- [X] T004 [P] Create the BullMQ worker TypeScript scaffold in `apps/worker/`
- [X] T005 [P] Create the shared Zod contracts package in `packages/shared/`
- [X] T006 [P] Create the Prisma database package in `packages/db/`
- [X] T007 Configure strict TypeScript settings, including `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, and an `any`-rejection lint rule in `tsconfig.base.json` and root lint configuration
- [X] T008 Add root scripts for install, development, typecheck, lint, formatting, unit tests, integration tests, and migrations in `package.json`
- [X] T009 [P] Document hosted Neon, Upstash, and Cloudinary configuration in `.env.example` and `apps/api/src/config.ts`; include `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `CLOUDINARY_SIGNED_URL_TTL_SECONDS`, and `DOCUMENT_MAX_BYTES` (default 10 MB on the Cloudinary Free plan, configurable per deployment)
- [X] T010 [P] Configure Vitest and Supertest test roots across `apps/*/tests/`, `packages/*/tests/`, and root test configuration
- [X] T011 [P] Configure Next.js same-origin `/api/v1/*` routing to Express in `apps/web/next.config.ts`
- [X] T012 Document required local and deployment environment variables in `apps/api/src/config.ts` and `.env.example`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Build the shared database, tenant boundary, validation, API, and queue primitives required by every story.

**CRITICAL**: No user story implementation can begin until this phase is complete.

### Database and tenant isolation

- [X] T013 Define Prisma models and UUID/tenant relations for `User`, `RefreshToken`, `Workspace`, `Document`, `Workflow`, `Execution`, `ExecutionStep`, `StepAttempt`, `ExecutionEvent`, `Report`, `Approval`, `PendingReport`, and `OutboxEvent` in `packages/db/prisma/schema.prisma`, using constraints from [data-model.md](./data-model.md)
- [X] T014 Create the initial reviewed migration and migration-only role setup in `packages/db/prisma/migrations/`
- [X] T015 Add PostgreSQL RLS policies with default-deny tenant context for every workspace-owned table in `packages/db/prisma/migrations/`
- [X] T016 Implement the runtime Prisma client and direct/migration connection separation in `packages/db/src/client.ts`
- [X] T017 Implement transaction-local `app.user_id` and `app.workspace_id` context in `packages/db/src/tenant-transaction.ts`
- [X] T018 Implement workspace-scoped base repositories and composite-key guards in `packages/db/src/repositories/`
- [X] T019 [P] Add migration/integration tests proving missing tenant context denies access and mismatched workspace relations are rejected in `packages/db/tests/tenant-isolation.test.ts`

### Shared contracts and API foundation

- [X] T020 Create shared Zod schemas for API errors, IDs, auth credentials, and workspace/document/workflow/report contracts in `packages/shared/src/schemas/`
- [X] T021 Create shared workflow graph Zod types and semantic validators for DAG bounds and conditions in `packages/shared/src/workflow/`
- [X] T022 Create stable API error/request contracts and inferred types in `packages/shared/src/api/`
- [X] T023 [P] Add unit tests for Zod schemas and workflow graph validation in `packages/shared/tests/`
- [X] T024 Implement Express application setup, same-origin routing, JSON limits, centralized errors, and request IDs in `apps/api/src/app.ts` and `apps/api/src/middleware/error.ts`
- [X] T025 Implement JWT authentication middleware, secure `__Host-` / `HttpOnly` cookie configuration, origin/CSRF checks, and workspace owner lookup in `apps/api/src/middleware/`
- [X] T026 Implement workspace authorization middleware that sets and verifies tenant context inside a Prisma transaction in `apps/api/src/middleware/workspace.ts`
- [X] T027 [P] Add API security tests for generic errors, unauthenticated access, unauthorized workspace access, CSRF, and missing tenant context in `apps/api/tests/security.test.ts`
- [X] T028 Implement the Cloudinary storage adapter in `apps/api/src/adapters/object-storage.ts`: authenticated upload via signed server-side upload intent, raw-body upload and completion flow, authenticated signed download URLs (using `CLOUDINARY_SIGNED_URL_TTL_SECONDS`), workspace-prefixed `publicId` isolation, and authenticated asset deletion; replaces the former private S3-compatible object-store client
- [X] T029 Implement OpenRouter provider adapter with strict JSON Schema parameters, route restrictions, timeouts, and provider-error mapping in `apps/api/src/adapters/openrouter.ts`
- [ ] T030 [P] Add unit tests for request redaction and Cloudinary adapter behavior in `apps/api/tests/adapters.test.ts`; cover workspace-scoped `publicId` generation, `CloudinaryStorageError` mapping without exposing credentials, authenticated signed-URL issuance, and authenticated asset deletion; remove any remaining S3/`OBJECT_STORAGE_*` fixture references; fix the `OpenRouterConfig` shape mismatch so the config fixture passes `apiKey`, `model`, and `timeoutMs` directly rather than the full `AppConfig` object

### Durable execution foundation

- [X] T031 Implement the BullMQ queue/worker setup and identifier-only job payload schemas in `apps/worker/src/main.ts` and `apps/worker/src/outbox/`
- [X] T032 Implement transactional outbox creation and retryable dispatcher with unique event keys in `apps/worker/src/outbox/`
- [X] T033 Implement persisted execution state transitions and structured execution events in `apps/worker/src/workflow/state.ts`
- [X] T034 Implement the bounded DAG runner, branch evaluation, step scheduling, and no-repeat completed-step policy in `apps/worker/src/workflow/runner.ts`
- [X] T035 Implement the fixed typed tool registry and workspace/document authorization checks in `apps/worker/src/tools/registry.ts`
- [X] T036 [P] Add unit tests for DAG traversal, fixed condition operators, state transitions, retry policy, and tool authorization in `apps/worker/tests/workflow.test.ts`
- [X] T037 [P] Add integration tests for queue duplicate delivery, worker restart recovery, and outbox publication in `apps/worker/tests/durable-execution.test.ts`
- [X] T038 Implement redacted structured logging with request, workspace, execution, step, timing, and safe error fields in `apps/api/src/middleware/logger.ts` and `apps/worker/src/logger.ts`

**Checkpoint**: Shared services are ready; API, UI, and worker story work can proceed independently.

---

## Phase 3: User Story 2 - Create and manage a workspace (Priority: P1)

**Goal**: Provide registration, login, creator-owned workspaces, workspace switching, renaming, and strict cross-workspace isolation.

**Independent Test**: Create two accounts/workspaces and prove the first account cannot list, read, mutate, approve, or delete the second account's documents, workflows, reports, or executions.

### Tests for User Story 2

- [X] T064 [P] [US2] Add Supertest authentication and workspace contract tests in `apps/api/tests/auth-workspaces.contract.test.ts`
- [X] T065 [P] [US2] Add cross-workspace integration tests for every document/workflow/execution/report/approval endpoint in `apps/api/tests/workspace-isolation.test.ts`; ensure the config fixture uses Cloudinary fields (`CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `CLOUDINARY_SIGNED_URL_TTL_SECONDS`, `DOCUMENT_MAX_BYTES`) and removes all `OBJECT_STORAGE_*` references
- [X] T066 [P] [US2] Add document-removal integration tests proving source/report/pending content and private Cloudinary execution artifacts are deleted (via authenticated Cloudinary asset deletion through the outbox) and only content-free metadata remains in `apps/api/tests/document-deletion.test.ts`

### Implementation for User Story 2

- [X] T067 [P] [US2] Implement `User`, `RefreshToken` rotation/revocation, and password hashing repositories in `packages/db/src/repositories/auth.repository.ts`, using the constraints in [data-model.md](./data-model.md): `User.email`, `User.passwordHash`, `RefreshToken.tokenHash`
- [X] T068 [P] [US2] Implement creator-owned workspace repositories with `(ownerId, createdAt)` lookup and rename behavior in `packages/db/src/repositories/workspace.repository.ts`, citing [data-model.md](./data-model.md): `Workspace.ownerId`, `Workspace.name`
- [X] T069 [US2] Implement Argon2id registration and login, generic invalid-credential responses, and JWT access/refresh cookie issuance in `apps/api/src/modules/auth/`
- [X] T070 [US2] Implement refresh-token rotation with reuse detection, logout family revocation, current-user lookup, and secure cookie clearing in `apps/api/src/modules/auth/`
- [X] T071 [US2] Implement workspace list/create/rename endpoints in `apps/api/src/modules/workspaces/`
- [X] T072 [US2] Enforce owner-only access in every workspace-scoped route and repository call in `apps/api/src/modules/`
- [X] T073 [US2] Implement immediate document removal state, report/pending approval cancellation, authenticated Cloudinary asset deletion outbox event (covering `sourcePublicId`, `textPublicId`, and workspace-prefixed execution artifact public IDs), and execution reference detachment in `apps/api/src/modules/documents/deletion.ts`
- [X] T074 [US2] Implement document delete endpoint `DELETE /workspaces/{workspaceId}/documents/{documentId}` in `apps/api/src/modules/documents/`
- [X] T075 [P] [US2] Build registration, login, logout, workspace selection, and workspace rename UI in `apps/web/src/features/auth/` and `apps/web/src/features/workspaces/`
- [X] T076 [US2] Verify browser navigation and API calls never expose or request resources outside the selected creator-owned workspace in `apps/web/src/features/workspaces/`

**Checkpoint**: User Story 2 provides isolated authentication/workspace management and scoped document deletion.

---

## Phase 4: User Story 1 - Process a document with a workflow (Priority: P1) 🎯 MVP

**Goal**: Allow a signed-in workspace owner to upload a document, receive an editable AI workflow, confirm execution, and view a generated report.

**Independent Test**: Using the authentication and creator-owned workspace completed in US2, upload a valid PDF/DOCX/TXT, generate and confirm a summary workflow, execute it, and verify summary, dates, action items, and approval/replacement behavior where applicable.

### Tests for User Story 1

- [X] T039 [P] [US1] Add Supertest contract tests for document upload, proposal, workflow creation, execution, and report endpoints in `apps/api/tests/document-workflow.contract.test.ts`
- [X] T040 [P] [US1] Add integration tests for PDF/DOCX/TXT parsing limits and invalid/corrupt uploads in `apps/worker/tests/document-processing.test.ts`
- [X] T041 [P] [US1] Add integration tests for proposal validation and one bounded repair attempt in `apps/api/tests/workflow-proposal.test.ts`
- [X] T042 [P] [US1] Add end-to-end worker/API tests for document extraction, analysis, report creation, idempotent execution, and restart recovery from persisted step artifacts in `apps/worker/tests/document-e2e.test.ts`

### Implementation for User Story 1

- [X] T043 [P] [US1] Implement document repositories for `Document.sourcePublicId`, `Document.textPublicId`, `Document.status`, and document metadata in `packages/db/src/repositories/document.repository.ts`, citing [data-model.md](./data-model.md): `Document.status`, `Document.byteSize`, `Document.pageCount`, `Document.textCharacterCount`; Cloudinary asset references are stored as `sourcePublicId`, `sourceResourceType`, `sourceDeliveryType`, `sourceFormat`, `textPublicId`, `textResourceType`, `textDeliveryType`, `textFormat` rather than the former `sourceObjectKey` / `textObjectKey`
- [X] T044 [P] [US1] Implement workflow repositories for `Workflow.definition`, `Workflow.revision`, and `Workflow.definitionVersion` in `packages/db/src/repositories/workflow.repository.ts`
- [X] T045 [P] [US1] Implement execution repositories for immutable snapshots, step-attempt history, and workspace-scoped `ExecutionArtifact` references in `packages/db/src/repositories/execution.repository.ts`; add the Prisma migration and RLS policy
- [X] T046 [P] [US1] Implement report and pending-report repositories in `packages/db/src/repositories/report.repository.ts` and `packages/db/src/repositories/approval.repository.ts`
- [X] T047 [US1] Implement the document upload flow in `apps/api/src/modules/documents/`: issue a server-side upload intent (signed Cloudinary upload parameters), receive the raw file body from the client, forward it to Cloudinary via the upload API, record the resulting `publicId`/`resourceType`/`deliveryType`/`format` metadata, and transition the document to `validating` via the completion endpoint (`POST /workspaces/{workspaceId}/documents` and `/complete`); no presigned browser-direct upload URLs are involved
- [X] T048 [US1] Implement PDF parsing with native page count and PDF.js text extraction in `apps/worker/src/processors/document.processor.ts`
- [X] T049 [US1] Implement DOCX raw-text extraction and UTF-8 TXT decoding with bounded memory and the 300,000-character extracted-text limit in `apps/worker/src/processors/document.processor.ts`, citing [data-model.md](./data-model.md): `Document.textCharacterCount`
- [X] T050 [US1] Implement document validation, file-size enforcement, 100 native PDF-page limit, stable failure codes, and ready status transitions in `apps/worker/src/processors/document.processor.ts`, citing [data-model.md](./data-model.md): `Document.byteSize`, `Document.pageCount`, `Document.mediaType`; the enforced size limit is read from `DOCUMENT_MAX_BYTES` (default 10 MB on the Cloudinary Free plan; override in `.env` only when the account plan supports a higher raw-file limit — do not assume 20 MB)
- [X] T051 [US1] Implement AI workflow proposal generation for `POST /workspaces/{workspaceId}/workflow-proposals` in `apps/api/src/modules/workflows/proposal.ts`
- [X] T052 [US1] Validate proposal JSON with the shared graph schema and semantic rules; reject unsupported tools and malformed output in `apps/api/src/modules/workflows/validate.ts`
- [X] T053 [US1] Implement save/create/update workflow endpoints and optimistic revision checks in `apps/api/src/modules/workflows/`
- [X] T054 [US1] Implement document-analysis AI calls with bounded chunking, rate-limited concurrency, and typed summary/date/action-item output in `apps/worker/src/tools/analyze-document.ts`
- [X] T055 [US1] Implement document extraction, report creation, and report replacement tool handlers through the fixed registry in `apps/worker/src/processors/workflow.processor.ts` and `apps/worker/src/tools/registry.ts`
- [X] T056 [US1] Create a pending report replacement approval with immutable action type, workspace ID, target report ID, expected revision, and proposed content in `packages/db/src/repositories/execution.repository.ts`, `apps/worker/src/processors/workflow.processor.ts`, and `apps/api/src/modules/approvals/`
- [X] T057 [US1] Implement execution creation with immutable snapshot, initial steps, idempotency key, and outbox event in `apps/api/src/modules/executions/create.ts`
- [X] T058 [US1] Implement execution start, persisted step processing, and waiting states in `apps/api/src/modules/executions/` and `apps/worker/src/processors/workflow.processor.ts`
- [X] T059 [US1] Implement report list/get and workspace-scoped report content response in `apps/api/src/modules/reports/`
- [X] T060 [P] [US1] Build document upload and status UI in `apps/web/src/features/documents/`
- [X] T061 [P] [US1] Build natural-language workflow proposal review UI in `apps/web/src/features/documents/document-workflow-panel.tsx`
- [X] T062 [P] [US1] Build execution confirmation and report-review UI in `apps/web/src/features/documents/document-workflow-panel.tsx`
- [X] T063 [US1] Integrate the authenticated document-to-report journey through the same-origin API client in `apps/web/src/lib/api.ts`

**Checkpoint**: User Story 1 delivers an authenticated upload → propose → confirm → execute → report journey with approved tools and approval pause support.

## Phase 5: User Story 3 - Visually edit and branch a workflow (Priority: P2)

**Goal**: Let users visually add, remove, reorder, and configure a validated workflow graph with fixed condition branches, then save it for reuse.

**Independent Test**: Open a React Flow proposal, edit or branch nodes, save, reload, and verify invalid graphs are rejected while true/false condition outcomes execute the intended branch.

### Tests for User Story 3

- [X] T077 [P] [US3] Add unit tests for node/edge editing invariants and condition branch serialization in `packages/shared/tests/workflow-builder.test.ts`
- [X] T078 [P] [US3] Add integration tests for stale workflow revisions and save/run rejection of malformed graphs in `apps/api/tests/workflows.contract.test.ts`
- [X] T079 [P] [US3] Add worker tests proving exactly the true or false branch executes for fixed condition results in `apps/worker/tests/condition.test.ts`

### Implementation for User Story 3

- [X] T080 [P] [US3] Implement React Flow canvas nodes for approved action types and fixed condition types in `apps/web/src/features/workflow-builder/nodes/`
- [X] T081 [P] [US3] Implement edge rendering and true/false branch controls in `apps/web/src/features/workflow-builder/edges/`
- [X] T082 [P] [US3] Implement visual add/remove/reorder and typed configuration controls in `apps/web/src/features/workflow-builder/`
- [X] T083 [US3] Implement client-side graph validation and actionable save/run feedback in `apps/web/src/features/workflow-builder/validation.ts`
- [X] T084 [US3] Implement workflow list/get/save/update UI against the OpenAPI contracts in `apps/web/src/features/workflows/`
- [X] T085 [US3] Implement `If-Match` expected-revision handling and stale-edit conflict feedback in `apps/api/src/modules/workflows/update.ts`
- [X] T086 [US3] Extend workflow save/run validation to reject unresolved edges, cycles, unreachable nodes, ambiguous conditions, and unsupported fields in `packages/shared/src/workflow/validate.ts`

**Checkpoint**: User Story 3 provides a saved, reusable, visually editable and condition-capable workflow DAG.

---

## Phase 6: User Story 4 - Review runs, errors, and approvals (Priority: P2)

**Goal**: Provide workspace execution history, step-level statuses, owner approval decisions, useful safe errors, and eligible retries.

**Independent Test**: Start one approval-pending run and one failed run; verify pending approval controls, one-time decisions, step history, and retry behavior without repeating completed or unsafe actions.

### Tests for User Story 4

- [X] T087 [P] [US4] Add Supertest contract tests for approval detail retrieval, required action/report/workspace/revision/content fields, list responses without content, and decision responses in `apps/api/tests/approvals-executions.contract.test.ts`
- [X] T088 [P] [US4] Add integration tests for approval pause, approval replacement, rejection without replacement, and stale revision conflict cancelling the approval/execution while leaving the report unchanged in `apps/worker/tests/approval.test.ts`
- [X] T089 [P] [US4] Add integration tests for safe retry, completed-step skipping, and terminal permanent errors in `apps/worker/tests/retry.test.ts`
- [X] T090 [P] [US4] Add security tests proving only the owning workspace owner can list/retrieve approval details or approve/reject, and unauthorized requests reveal no approval or proposed content, in `apps/api/tests/approvals-executions.contract.test.ts`

### Implementation for User Story 4

- [X] T091 [P] [US4] Implement execution/step/event list repositories in `packages/db/src/repositories/execution-history.repository.ts`
- [X] T092 [P] [US4] Implement approval repositories for immutable action/workspace/report/revision scope, owner-scoped detail reads, linked pending content, and one-time status transitions in `packages/db/src/repositories/approval.repository.ts`
- [X] T093 [US4] Implement execution list/get and step/event detail endpoints in `apps/api/src/modules/executions/history.ts`
- [X] T094 [US4] Implement eligible step retry creation and completed-step skip behavior in `apps/api/src/modules/executions/retry.ts`
- [X] T095 [US4] Implement owner-authorized approval list summaries and `GET /workspaces/{workspaceId}/approvals/{approvalId}` detail retrieval returning action type, workspace ID, target report ID, expected revision, and proposed content only while pending in `apps/api/src/modules/approvals/`
- [X] T096 [US4] Implement owner-only approve/reject decisions in one transaction; compare the current report revision with both stored expected revisions before replacement, return conflict and cancel approval/execution on stale revision without changing the report, and discard proposed content on rejection in `packages/db/src/repositories/approval.repository.ts` and `apps/api/src/modules/approvals/`
- [X] T097 [US4] Implement approval continuation and rejection/stale-revision cancellation outbox events; stop execution on rejection or stale revision in `packages/db/src/repositories/approval.repository.ts` and `apps/worker/src/outbox/processor.ts`
- [X] T098 [P] [US4] Build execution history and step-detail UI in `apps/web/src/features/executions/`
- [X] T099 [P] [US4] Build owner-only approval detail UI showing action type, workspace, target report, expected revision, and pending proposed content, with approve/reject and stale/rejected states in `apps/web/src/features/documents/document-workflow-panel.tsx`
- [X] T100 [US4] Build safe retry controls that explain permanent/non-repeatable failure conditions in `apps/web/src/features/executions/retry.tsx`

**Checkpoint**: User Story 4 exposes trustworthy run, error, retry, and approval behavior.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Complete quality, security, performance, deployment, and final acceptance validation.

- [X] T101 [P] Add npm production start scripts for the Next.js app, API, and worker; keep service credentials external in `apps/web/package.json`, `apps/api/package.json`, and `apps/worker/package.json`
- [X] T102 [P] Validate API and worker database/Redis dependencies before accepting or processing work, and expose API readiness in `/readyz` and worker startup status in app entry points
- [X] T103 [P] Add rate limits for authentication, workflow proposals, uploads, and AI calls in `apps/api/src/middleware/rate-limit.ts`
- [X] T104 [P] Add privacy and redaction checks that reject logs/output containing prompts, document text, report content, credentials, Cloudinary API secrets, or provider secrets in `apps/api/tests/redaction.test.ts` and `apps/worker/tests/redaction.test.ts`; verify that `CLOUDINARY_API_SECRET` and Cloudinary-signed URLs with embedded signatures are never written to logs
- [ ] T105 Run strict typecheck and remove or document-justify any remaining `any` usage across `apps/` and `packages/`; the current typecheck fails due to stale `OBJECT_STORAGE_*` references in `workspace-isolation.test.ts`, missing `DOCUMENT_MAX_BYTES` in multiple test config fixtures, and an `OpenRouterConfig` shape mismatch in `adapters.test.ts` — these must be resolved before this task can be marked complete
- [ ] T106 Run the unit and integration suites, inspect coverage for authorization, validation, retry, and deletion, and fix failures in `apps/**/tests/` and `packages/**/tests/`
- [X] T107 Run the OpenAPI lint and align stable response schemas with shared Zod contracts in `specs/001-workflow-automation/contracts/openapi.yaml` and `packages/shared/src/schemas/`
- [ ] T108 Execute the quickstart end-to-end acceptance walkthrough and document exact results in `specs/001-workflow-automation/quickstart.md`
- [X] T109 Run synthetic performance validation for documents up to `DOCUMENT_MAX_BYTES` (default 10 MB) and 100-page PDFs with the 3-minute report target in `apps/worker/tests/performance.test.ts`
- [ ] T110 Run a final workspace-isolation/security review across database RLS, API middleware, Cloudinary storage adapter (workspace-prefixed public IDs, authenticated asset access, authenticated deletion, `CLOUDINARY_API_SECRET` protection), and worker state in `apps/`, `packages/db/`, and `packages/shared/`; this task is incomplete until all Cloudinary-specific security properties are verified against a live adapter

---

## Phase 8: Cloudinary Storage Verification

**Purpose**: Verify that every Cloudinary-specific storage behaviour is correct — uploads, authenticated access, deletion, consistency, and integration — using both mocked unit tests and real Cloudinary integration tests where credentials are available.

> [!IMPORTANT]
> Tasks T111–T117 are **mocked unit / contract tests** that must pass in CI without real Cloudinary credentials.
> Task T118 is a **real Cloudinary integration test** that is opt-in and must never run against production resources.

- [ ] T111 [P] Add unit tests for `createObjectStorage` and `createPrivateObjectKey` in `apps/api/tests/adapters.test.ts`: verify that generated public IDs are workspace- and document-scoped (prefix `flowpilot/workspaces/<workspaceId>/documents/<documentId>/`), unique across two calls for the same inputs, and free of the original filename; verify that `CloudinaryStorageError` wrapping does not echo the raw cause message; verify the `CLOUDINARY_SIGNED_URL_TTL_SECONDS` default and range
- [ ] T112 [P] Add unit tests covering the authenticated signed-download flow in the Cloudinary adapter: mock the Cloudinary SDK to assert that `sign_url: true` and the correct TTL are passed for every asset retrieval, that the signed URL is never logged, and that an SDK error is mapped to `CloudinaryStorageError` without exposing the raw error body
- [ ] T113 [P] Add unit tests covering authenticated Cloudinary asset deletion: mock the Cloudinary SDK `destroy` call and verify it is called with the correct `publicId` and `resource_type`, that deletion is idempotent for a `not found` SDK response, and that a network/SDK error is mapped to `CloudinaryStorageError`
- [ ] T114 [P] Add unit tests verifying the API and worker storage interface consistency: assert that `DocumentRepository.createUploadIntent` stores `sourcePublicId`, `sourceResourceType`, `sourceDeliveryType`, and `sourceFormat` (not `sourceObjectKey`); that `markReady` stores `textPublicId`, `textResourceType`, `textDeliveryType`, and `textFormat` (not `textObjectKey`); and that `ExecutionArtifact` rows reference a `publicId` field rather than `objectKey`
- [ ] T115 [P] Add unit tests for the document extraction and report generation code paths that use Cloudinary assets: mock the worker storage adapter's `readObject` call to return fixture bytes for a known `publicId`, run the extraction, and assert that the resulting `textPublicId` written by `markReady` matches the expected Cloudinary public-ID format
- [ ] T116 [P] Add unit tests covering failure handling, retries, and idempotent deletion in the outbox processor: assert that a `CloudinaryStorageError` on deletion is retried up to the configured maximum; that a `not found` response from Cloudinary is treated as a successful deletion (idempotent); that after all Cloudinary deletions succeed the outbox event is marked published and the document row is purged; and that a permanent deletion failure does not leave the document in a non-`deleting` state
- [ ] T117 [P] Add contract/unit tests verifying that the `workspace-isolation.test.ts` and all other API test config fixtures use only Cloudinary config fields (`CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `CLOUDINARY_SIGNED_URL_TTL_SECONDS`, `DOCUMENT_MAX_BYTES`) and contain no `OBJECT_STORAGE_*` references; assert that `readConfig` rejects a config object that supplies `OBJECT_STORAGE_ENDPOINT` instead of `CLOUDINARY_CLOUD_NAME`
- [ ] T118 Perform a real Cloudinary lifecycle integration test when `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, and `FLOWPILOT_TEST_CONFIRM_NON_PRODUCTION` are set in the environment; the test must: (1) upload a small fixture file using the server-side upload flow and assert the returned `publicId` has the expected workspace prefix; (2) retrieve the asset via an authenticated signed URL and verify content integrity; (3) delete the asset via authenticated deletion and verify the Cloudinary API confirms removal; (4) attempt a second deletion and verify idempotent success; guard this test with the `FLOWPILOT_TEST_CONFIRM_NON_PRODUCTION` sentinel so it never runs in CI without explicit opt-in; document exact results in `specs/001-workflow-automation/quickstart.md` after a successful run

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 Setup**: No dependencies; starts immediately.
- **Phase 2 Foundational**: Depends on Phase 1 and blocks every user story.
- **User Story 2**: Depends on Phase 2 and is the authentication/workspace prerequisite for US1.
- **User Story 1**: Depends on Phase 2 and the completed US2 authentication, session, owner-authorization, and workspace-creation implementation.
- **User Story 3**: Depends on Phase 2 and shared workflow validation; can proceed in parallel with US1/US2 after foundation.
- **User Story 4**: Depends on execution, approval, and state foundations plus the relevant US1 implementation.
- **Polish**: Depends on all required user stories.
- **Phase 8 Cloudinary Verification**: Depends on T028 (Cloudinary adapter), T043 (document repository), T073 (deletion), and T104 (redaction); T111–T117 (mocked) can run in CI; T118 (real integration) requires opt-in credentials.

### User Story Dependencies

- **US2 (P1)**: Authentication/workspace prerequisite; must complete registration, login, session management, workspace creation/rename, and owner isolation before US1 begins.
- **US1 (P1)**: Core MVP document/process journey; can begin only after the completed US2 authentication and workspace boundary is available.
- **US3 (P2)**: Independently testable workflow editing and condition behavior; integrates with saved workflow entities.
- **US4 (P2)**: Independently testable history/approval/retry behavior after US1 execution infrastructure exists.

### Within Each User Story

- Tests first, then repositories/shared data behavior, services/endpoints/tools, UI, and integration verification.
- Database and shared foundation tasks precede story-specific endpoints and UI.
- Complete each story checkpoint before calling it done.

---

## Parallel Opportunities

- Phase 1 scaffolds for web, API, worker, shared, and db can proceed in parallel after the root workspace exists.
- Phase 2 database RLS tests, shared schema tests, API security tests, adapter tests, and worker tests can proceed in parallel once their respective foundations exist.
- After Phase 2, US2 must complete before US1 begins; US3 can proceed in parallel with US2 once shared graph validation exists.
- Within US1, document repositories/processors, proposal logic, report tools, and web UI are parallelizable after foundational contracts.
- Within US2, auth repositories/endpoints and workspace UI can proceed in parallel after tenant middleware.
- Within US4, execution history and approval repositories/endpoints/UI can proceed in parallel after state entities exist.
- Phase 8 T111–T117 are independently parallelizable mocked tests; T118 runs sequentially after all mocked tests pass.

---

## Parallel Example: User Story 1

```text
T039 Contract tests
T040 Document parser integration tests
T041 Proposal validation tests
T043-T046 Document/workflow/execution/report repositories
T048-T050 PDF/DOCX/TXT processors
T060-T062 Web document, workflow, execution, and report UI
```

---

## Parallel Example: User Story 2

```text
T064 Auth/workspace contract tests
T065 Cross-workspace isolation tests
T067 Auth repository
T068 Workspace repository
T075 Auth/workspace UI
```

---

## Implementation Strategy

### MVP First

1. Complete Phases 1 and 2.
2. Complete User Story 2 first to establish registration, login, session management, creator-owned workspaces, and owner isolation.
3. Complete User Story 1 after the US2 checkpoint to deliver the authenticated document-to-report workflow.
4. Validate the US1/US2 integrated journey independently.
5. Stop and demo the MVP before P2 stories.

### Incremental Delivery

1. Add US3 for visual editing and reusable conditional workflows.
2. Add US4 for execution history, approvals, safe retry, and review.
3. Complete Polish, security, performance, and acceptance validation.
4. Complete Phase 8 Cloudinary verification (mocked T111–T117 in CI; opt-in T118 with real credentials).

### Parallel Team Strategy

1. One team completes Setup and Foundational.
2. Complete the US2 authentication/workspace checkpoint before starting US1 document execution.
3. Add separate developers for US3 and US4 after shared foundations are stable.
4. Each completed story ends at its checkpoint before remaining work continues.

---

## Notes

- [P] tasks affect different files or isolated concerns and have no dependency on incomplete tasks.
- [USn] labels appear only in user-story phases.
- Setup and Foundational tasks do not have story labels.
- Every task starts with `- [ ]` or `- [X]`, a sequential `T` ID, and an exact or scoped file path.
- Constrained fields cite `data-model.md` with the exact `Entity.field` name.
- No implementation code is created by this task-generation step.
- Storage migration note: the project migrated from a private S3-compatible object store (formerly configured via `OBJECT_STORAGE_ENDPOINT`, `OBJECT_STORAGE_REGION`, `OBJECT_STORAGE_BUCKET`, `OBJECT_STORAGE_ACCESS_KEY`, `OBJECT_STORAGE_SECRET_KEY`) to Cloudinary (configured via `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `CLOUDINARY_SIGNED_URL_TTL_SECONDS`, `DOCUMENT_MAX_BYTES`). Any remaining `OBJECT_STORAGE_*` references in source or test files are outdated and must be replaced. The old `sourceObjectKey` / `textObjectKey` database fields have been replaced by `sourcePublicId` / `textPublicId` (and their associated `resourceType`, `deliveryType`, `format` fields). The Cloudinary Free plan enforces a 10 MB limit on raw file uploads; the `DOCUMENT_MAX_BYTES` default reflects this. Do not assume a 20 MB limit unless the account plan explicitly supports it.
