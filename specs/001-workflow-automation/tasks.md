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
- [X] T009 [P] Add Docker Compose services for PostgreSQL, Redis, and MinIO with environment templates in `compose.yaml` and `.env.example`
- [X] T010 [P] Configure Vitest and Supertest test roots across `apps/*/tests/`, `packages/*/tests/`, and root test configuration
- [X] T011 [P] Configure Next.js same-origin `/api/v1/*` routing to Express in `apps/web/next.config.ts`
- [X] T012 Document required local and deployment environment variables in `apps/api/src/config.ts` and `.env.example`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Build the shared database, tenant boundary, validation, API, and queue primitives required by every story.

**CRITICAL**: No user story implementation can begin until this phase is complete.

### Database and tenant isolation

- [X] T013 Define Prisma models and UUID/tenant relations for `User`, `Session`, `Workspace`, `Document`, `Workflow`, `Execution`, `ExecutionStep`, `StepAttempt`, `ExecutionEvent`, `Report`, `Approval`, `PendingReport`, and `OutboxEvent` in `packages/db/prisma/schema.prisma`, using constraints from [data-model.md](./data-model.md)
- [X] T014 Create the initial reviewed migration and migration-only role setup in `packages/db/prisma/migrations/`
- [X] T015 Add PostgreSQL RLS policies with default-deny tenant context for every workspace-owned table in `packages/db/prisma/migrations/`
- [X] T016 Implement the runtime Prisma client and direct/migration connection separation in `packages/db/src/client.ts`
- [X] T017 Implement transaction-local `app.user_id` and `app.workspace_id` context in `packages/db/src/tenant-transaction.ts`
- [X] T018 Implement workspace-scoped base repositories and composite-key guards in `packages/db/src/repositories/`
- [X] T019 [P] Add migration/integration tests proving missing tenant context denies access and mismatched workspace relations are rejected in `packages/db/tests/tenant-isolation.test.ts`

### Shared contracts and API foundation

- [X] T020 Create shared Zod schemas for API errors, IDs, session credentials, and workspace/document/workflow/report contracts in `packages/shared/src/schemas/`
- [X] T021 Create shared workflow graph Zod types and semantic validators for DAG bounds and conditions in `packages/shared/src/workflow/`
- [X] T022 Create stable API error/request contracts and inferred types in `packages/shared/src/api/`
- [X] T023 [P] Add unit tests for Zod schemas and workflow graph validation in `packages/shared/tests/`
- [X] T024 Implement Express application setup, same-origin routing, JSON limits, centralized errors, and request IDs in `apps/api/src/app.ts` and `apps/api/src/middleware/error.ts`
- [X] T025 Implement session authentication middleware, secure cookie configuration, origin/CSRF checks, and workspace owner lookup in `apps/api/src/middleware/`
- [X] T026 Implement workspace authorization middleware that sets and verifies tenant context inside a Prisma transaction in `apps/api/src/middleware/workspace.ts`
- [X] T027 [P] Add API security tests for generic errors, unauthenticated access, unauthorized workspace access, CSRF, and missing tenant context in `apps/api/tests/security.test.ts`
- [X] T028 Implement private S3-compatible object-store client and short-lived signed upload/download URLs in `apps/api/src/adapters/object-storage.ts`
- [X] T029 Implement OpenRouter provider adapter with strict JSON Schema parameters, route restrictions, timeouts, and provider-error mapping in `apps/api/src/adapters/openrouter.ts`
- [X] T030 [P] Add unit tests for request redaction and object/OpenRouter adapter error behavior in `apps/api/tests/adapters.test.ts`

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
- [ ] T065 [P] [US2] Add cross-workspace integration tests for every document/workflow/execution/report/approval endpoint in `apps/api/tests/workspace-isolation.test.ts`
- [ ] T066 [P] [US2] Add document-removal integration tests proving source/report/pending content and private execution artifacts are deleted and only content-free metadata remains in `apps/api/tests/document-deletion.test.ts`

### Implementation for User Story 2

- [X] T067 [P] [US2] Implement `User`, `Session`, password hashing, and opaque session repositories in `packages/db/src/repositories/auth.repository.ts`, using the constraints in [data-model.md](./data-model.md): `User.email`, `User.passwordHash`, `Session.tokenHash`
- [X] T068 [P] [US2] Implement creator-owned workspace repositories with `(ownerId, createdAt)` lookup and rename behavior in `packages/db/src/repositories/workspace.repository.ts`, citing [data-model.md](./data-model.md): `Workspace.ownerId`, `Workspace.name`
- [X] T069 [US2] Implement Argon2id registration and login, generic invalid-credential responses, and session creation in `apps/api/src/modules/auth/`
- [X] T070 [US2] Implement logout, current-user lookup, session revocation, and secure cookie clearing in `apps/api/src/modules/auth/`
- [X] T071 [US2] Implement workspace list/create/rename endpoints in `apps/api/src/modules/workspaces/`
- [X] T072 [US2] Enforce owner-only access in every workspace-scoped route and repository call in `apps/api/src/modules/`
- [X] T073 [US2] Implement immediate document removal state, report/pending approval cancellation, private execution-artifact cleanup outbox event, and execution reference detachment in `apps/api/src/modules/documents/deletion.ts`
- [X] T074 [US2] Implement document delete endpoint `DELETE /workspaces/{workspaceId}/documents/{documentId}` in `apps/api/src/modules/documents/`
- [X] T075 [P] [US2] Build registration, login, logout, workspace selection, and workspace rename UI in `apps/web/src/features/auth/` and `apps/web/src/features/workspaces/`
- [ ] T076 [US2] Verify browser navigation and API calls never expose or request resources outside the selected creator-owned workspace in `apps/web/src/features/workspaces/`

**Checkpoint**: User Story 2 provides isolated authentication/workspace management and scoped document deletion.

---

## Phase 4: User Story 1 - Process a document with a workflow (Priority: P1) 🎯 MVP

**Goal**: Allow a signed-in workspace owner to upload a document, receive an editable AI workflow, confirm execution, and view a generated report.

**Independent Test**: Using the authentication and creator-owned workspace completed in US2, upload a valid PDF/DOCX/TXT, generate and confirm a summary workflow, execute it, and verify summary, dates, action items, and approval/replacement behavior where applicable.

### Tests for User Story 1

- [ ] T039 [P] [US1] Add Supertest contract tests for document upload, proposal, workflow creation, execution, and report endpoints in `apps/api/tests/document-workflow.contract.test.ts`
- [X] T040 [P] [US1] Add integration tests for PDF/DOCX/TXT parsing limits and invalid/corrupt uploads in `apps/worker/tests/document-processing.test.ts`
- [ ] T041 [P] [US1] Add integration tests for proposal validation and one bounded repair attempt in `apps/api/tests/workflow-proposal.test.ts`
- [ ] T042 [P] [US1] Add end-to-end worker/API tests for document extraction, analysis, report creation, idempotent execution, and restart recovery from persisted step artifacts in `apps/worker/tests/document-e2e.test.ts`

### Implementation for User Story 1

- [X] T043 [P] [US1] Implement document repositories for `Document.sourceObjectKey`, `Document.textObjectKey`, `Document.status`, and document metadata in `packages/db/src/repositories/document.repository.ts`, citing [data-model.md](./data-model.md): `Document.status`, `Document.byteSize`, `Document.pageCount`, `Document.textCharacterCount`
- [X] T044 [P] [US1] Implement workflow repositories for `Workflow.definition`, `Workflow.revision`, and `Workflow.definitionVersion` in `packages/db/src/repositories/workflow.repository.ts`
- [X] T045 [P] [US1] Implement execution repositories for immutable snapshots, step-attempt history, and workspace-scoped `ExecutionArtifact` references in `packages/db/src/repositories/execution.repository.ts`; add the Prisma migration and RLS policy
- [X] T046 [P] [US1] Implement report and pending-report repositories in `packages/db/src/repositories/report.repository.ts` and `packages/db/src/repositories/approval.repository.ts`
- [X] T047 [US1] Implement document upload intent, private URL issuance, completion, readiness, and file validation for `POST /workspaces/{workspaceId}/documents` and `/complete` in `apps/api/src/modules/documents/`
- [X] T048 [US1] Implement PDF parsing with native page count and PDF.js text extraction in `apps/worker/src/processors/document.processor.ts`
- [X] T049 [US1] Implement DOCX raw-text extraction and UTF-8 TXT decoding with bounded memory and the 300,000-character extracted-text limit in `apps/worker/src/processors/document.processor.ts`, citing [data-model.md](./data-model.md): `Document.textCharacterCount`
- [X] T050 [US1] Implement document validation, 20 MB/file limit, 100 native PDF-page limit, stable failure codes, and ready status transitions in `apps/worker/src/processors/document.processor.ts`, citing [data-model.md](./data-model.md): `Document.byteSize`, `Document.pageCount`, `Document.mediaType`
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

- [ ] T077 [P] [US3] Add unit tests for node/edge editing invariants and condition branch serialization in `packages/shared/tests/workflow-builder.test.ts`
- [ ] T078 [P] [US3] Add integration tests for stale workflow revisions and save/run rejection of malformed graphs in `apps/api/tests/workflows.contract.test.ts`
- [ ] T079 [P] [US3] Add worker tests proving exactly the true or false branch executes for fixed condition results in `apps/worker/tests/condition.test.ts`

### Implementation for User Story 3

- [ ] T080 [P] [US3] Implement React Flow canvas nodes for approved action types and fixed condition types in `apps/web/src/features/workflow-builder/nodes/`
- [ ] T081 [P] [US3] Implement edge rendering and true/false branch controls in `apps/web/src/features/workflow-builder/edges/`
- [ ] T082 [P] [US3] Implement visual add/remove/reorder and typed configuration controls in `apps/web/src/features/workflow-builder/`
- [ ] T083 [US3] Implement client-side graph validation and actionable save/run feedback in `apps/web/src/features/workflow-builder/validation.ts`
- [ ] T084 [US3] Implement workflow list/get/save/update UI against the OpenAPI contracts in `apps/web/src/features/workflows/`
- [ ] T085 [US3] Implement `If-Match` expected-revision handling and stale-edit conflict feedback in `apps/api/src/modules/workflows/update.ts`
- [ ] T086 [US3] Extend workflow save/run validation to reject unresolved edges, cycles, unreachable nodes, ambiguous conditions, and unsupported fields in `packages/shared/src/workflow/validate.ts`

**Checkpoint**: User Story 3 provides a saved, reusable, visually editable and condition-capable workflow DAG.

---

## Phase 6: User Story 4 - Review runs, errors, and approvals (Priority: P2)

**Goal**: Provide workspace execution history, step-level statuses, owner approval decisions, useful safe errors, and eligible retries.

**Independent Test**: Start one approval-pending run and one failed run; verify pending approval controls, one-time decisions, step history, and retry behavior without repeating completed or unsafe actions.

### Tests for User Story 4

- [X] T087 [P] [US4] Add Supertest contract tests for approval detail retrieval, required action/report/workspace/revision/content fields, list responses without content, and decision responses in `apps/api/tests/approvals-executions.contract.test.ts`
- [ ] T088 [P] [US4] Add integration tests for approval pause, approval replacement, rejection without replacement, and stale revision conflict cancelling the approval/execution while leaving the report unchanged in `apps/worker/tests/approval.test.ts`
- [ ] T089 [P] [US4] Add integration tests for safe retry, completed-step skipping, and terminal permanent errors in `apps/worker/tests/retry.test.ts`
- [X] T090 [P] [US4] Add security tests proving only the owning workspace owner can list/retrieve approval details or approve/reject, and unauthorized requests reveal no approval or proposed content, in `apps/api/tests/approvals-executions.contract.test.ts`

### Implementation for User Story 4

- [ ] T091 [P] [US4] Implement execution/step/event list repositories in `packages/db/src/repositories/execution-history.repository.ts`
- [X] T092 [P] [US4] Implement approval repositories for immutable action/workspace/report/revision scope, owner-scoped detail reads, linked pending content, and one-time status transitions in `packages/db/src/repositories/approval.repository.ts`
- [ ] T093 [US4] Implement execution list/get and step/event detail endpoints in `apps/api/src/modules/executions/history.ts`
- [ ] T094 [US4] Implement eligible step retry creation and completed-step skip behavior in `apps/api/src/modules/executions/retry.ts`
- [X] T095 [US4] Implement owner-authorized approval list summaries and `GET /workspaces/{workspaceId}/approvals/{approvalId}` detail retrieval returning action type, workspace ID, target report ID, expected revision, and proposed content only while pending in `apps/api/src/modules/approvals/`
- [X] T096 [US4] Implement owner-only approve/reject decisions in one transaction; compare the current report revision with both stored expected revisions before replacement, return conflict and cancel approval/execution on stale revision without changing the report, and discard proposed content on rejection in `packages/db/src/repositories/approval.repository.ts` and `apps/api/src/modules/approvals/`
- [X] T097 [US4] Implement approval continuation and rejection/stale-revision cancellation outbox events; stop execution on rejection or stale revision in `packages/db/src/repositories/approval.repository.ts` and `apps/worker/src/outbox/processor.ts`
- [ ] T098 [P] [US4] Build execution history and step-detail UI in `apps/web/src/features/executions/`
- [X] T099 [P] [US4] Build owner-only approval detail UI showing action type, workspace, target report, expected revision, and pending proposed content, with approve/reject and stale/rejected states in `apps/web/src/features/documents/document-workflow-panel.tsx`
- [ ] T100 [US4] Build safe retry controls that explain permanent/non-repeatable failure conditions in `apps/web/src/features/executions/retry.tsx`

**Checkpoint**: User Story 4 exposes trustworthy run, error, retry, and approval behavior.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Complete quality, security, performance, deployment, and final acceptance validation.

- [ ] T101 [P] Add Docker production-style images for Next.js, API, and worker with non-root users and runtime-only secrets in `apps/web/Dockerfile`, `apps/api/Dockerfile`, `apps/worker/Dockerfile`
- [ ] T102 [P] Add container health checks and startup dependency handling in `compose.yaml` and app server entry points
- [ ] T103 [P] Add rate limits for authentication, workflow proposals, uploads, and AI calls in `apps/api/src/middleware/rate-limit.ts`
- [ ] T104 [P] Add privacy and redaction checks that reject logs/output containing prompts, document text, report content, credentials, or provider secrets in `apps/api/tests/redaction.test.ts` and `apps/worker/tests/redaction.test.ts`
- [ ] T105 Run strict typecheck and remove or documented-justify any remaining `any` usage across `apps/` and `packages/`
- [ ] T106 Run the unit and integration suites, inspect coverage for authorization, validation, retry, and deletion, and fix failures in `apps/**/tests/` and `packages/**/tests/`
- [ ] T107 Run the OpenAPI lint and align stable response schemas with shared Zod contracts in `specs/001-workflow-automation/contracts/openapi.yaml` and `packages/shared/src/schemas/`
- [ ] T108 Execute the quickstart end-to-end acceptance walkthrough and document exact results in `specs/001-workflow-automation/quickstart.md`
- [ ] T109 Run synthetic performance validation for 20 MB/100-page documents and 3-minute report target in `apps/worker/tests/performance.test.ts`
- [ ] T110 Run a final workspace-isolation/security review across database RLS, API middleware, object storage, and worker state in `apps/`, `packages/db/`, and `packages/shared/`

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
- Every task starts with `- [ ]`, a sequential `T` ID, and an exact or scoped file path.
- Constrained fields cite `data-model.md` with the exact `Entity.field` name.
- No implementation code is created by this task-generation step.
