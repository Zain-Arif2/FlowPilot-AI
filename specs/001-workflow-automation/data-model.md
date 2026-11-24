# Data Model: Workflow Automation MVP

## Conventions

- Use UUID primary keys and UTC timestamps.
- Every workspace-owned row carries `workspaceId`. All reads and writes pass
  through a workspace-scoped repository and a transaction-local RLS context.
- Store file bytes and extracted text in a private object store; store only
  references and verified metadata in PostgreSQL. Persist typed intermediate
  step results as private object-store artifacts and keep their scoped
  references in PostgreSQL so workers can resume without rerunning completed
  steps.
- Persist workflow definitions and execution snapshots as versioned JSON, but
  validate both with the shared Zod schema before use.
- Logs, queue payloads, and step output metadata MUST NOT contain document text,
  report content, passwords, session tokens, or provider secrets.

## Entities

### User

| Field | Type | Constraints / purpose |
|---|---|---|
| `id` | UUID | Primary key |
| `email` | text | Required, normalized to lowercase, unique |
| `passwordHash` | text | Argon2id hash; never return in API responses |
| `createdAt`, `updatedAt` | timestamptz | Audit timestamps |

### Session

| Field | Type | Constraints / purpose |
|---|---|---|
| `id` | UUID | Primary key |
| `userId` | UUID | Foreign key to `User` |
| `tokenHash` | text | Unique hash of opaque cookie token |
| `expiresAt` | timestamptz | Required |
| `revokedAt` | timestamptz? | Set on logout/revocation |
| `createdAt` | timestamptz | Session creation time |

### Workspace

| Field | Type | Constraints / purpose |
|---|---|---|
| `id` | UUID | Primary key |
| `ownerId` | UUID | Foreign key to `User`; only member in MVP |
| `name` | text | Required; owner may rename |
| `createdAt`, `updatedAt` | timestamptz | Audit timestamps |

### Document

| Field | Type | Constraints / purpose |
|---|---|---|
| `id` | UUID | Primary key |
| `workspaceId` | UUID | Required tenant key |
| `uploadedById` | UUID | Foreign key to owner |
| `originalName` | text | Display metadata only; never used as object key |
| `mediaType` | enum | `pdf`, `docx`, or `txt`, verified from file content |
| `byteSize` | integer | 1 through 20 MB |
| `pageCount` | integer? | Native PDF count; maximum 100 |
| `textCharacterCount` | integer? | Extracted Unicode code points; DOCX/TXT maximum 300,000 |
| `sourceObjectKey` | text | Random, immutable private object key |
| `textObjectKey` | text? | Private extracted-text object; deleted with source |
| `checksum` | text? | Verified content digest; null until upload validation succeeds |
| `status` | enum | `uploading`, `validating`, `ready`, `failed`, `deleting` |
| `failureCode` | text? | Sanitized parse/validation failure |
| `createdAt`, `updatedAt` | timestamptz | Audit timestamps |

### Workflow

| Field | Type | Constraints / purpose |
|---|---|---|
| `id` | UUID | Primary key |
| `workspaceId` | UUID | Required tenant key |
| `name` | text | User-visible workflow name |
| `revision` | integer | Incremented on each accepted edit |
| `definitionVersion` | integer | Version of the graph schema |
| `definition` | JSONB | React Flow layout plus executable nodes/edges; no document text |
| `status` | enum | `active`, `archived` |
| `createdAt`, `updatedAt` | timestamptz | Audit timestamps |

### Execution

| Field | Type | Constraints / purpose |
|---|---|---|
| `id` | UUID | Primary key |
| `workspaceId` | UUID | Required tenant key |
| `workflowId` | UUID | Workspace-scoped foreign key |
| `createdById` | UUID | Workspace owner |
| `documentId` | UUID? | Set null when source document is removed |
| `workflowRevision` | integer | Revision used for this run |
| `workflowSnapshot` | JSONB | Immutable validated graph; contains no document content |
| `idempotencyKey` | text | Client retry key; unique per workspace and creator |
| `status` | enum | `queued`, `running`, `waiting_approval`, `succeeded`, `failed`, `cancelled` |
| `startedAt`, `finishedAt` | timestamptz? | Execution timing |
| `errorCode`, `errorMessage` | text? | Sanitized, content-free terminal error |
| `createdAt` | timestamptz | Run creation time |

### ExecutionStep and StepAttempt

`ExecutionStep` has one row per workflow node in a run: `id`, `workspaceId`,
`executionId`, `nodeId`, `actionType`, current `status`, and timestamps. Enforce
uniqueness on `(executionId, nodeId)`.

`StepAttempt` has one row per attempt: `id`, `workspaceId`, `executionStepId`,
`attemptNumber`, `status`, `startedAt`, `finishedAt`, `errorCode`, and
sanitized `errorMessage`. Enforce uniqueness on
`(executionStepId, attemptNumber)`. Do not persist AI output or document text
in these records.

### ExecutionArtifact

| Field | Type | Constraints / purpose |
|---|---|---|
| `id` | UUID | Primary key |
| `workspaceId` | UUID | Required tenant key |
| `executionId` | UUID | Workspace-scoped execution reference |
| `executionStepId` | UUID | Workspace-scoped step reference; one artifact per step |
| `sourceDocumentId` | UUID? | Source document; retained until artifact cleanup completes |
| `objectKey` | text | Private S3-compatible object key; never returned to clients |
| `createdAt` | timestamptz | Artifact creation time |

The object contains only the validated output needed by downstream steps.
PostgreSQL stores no artifact content. Workers write a private object first,
then persist its reference with the successful step transition in one
transaction. Recovery loads the referenced artifact for completed steps and
never reruns them. Artifacts remain available while an execution is running or
waiting for approval, then are deleted through an outbox event after the
execution becomes terminal. Document deletion also schedules cleanup and keeps
the document in `deleting` state until its artifacts and source objects have
been removed.

### ExecutionEvent

Append-only status/event metadata: `id`, `workspaceId`, `executionId`,
`executionStepId?`, `eventType`, `safeDetails` JSONB, and `createdAt`.
`safeDetails` is allowlisted (state, safe error code, attempt number, elapsed
time); it cannot contain prompts, document/report content, credentials, or
arbitrary provider responses.

### Report

| Field | Type | Constraints / purpose |
|---|---|---|
| `id` | UUID | Primary key |
| `workspaceId` | UUID | Required tenant key |
| `sourceDocumentId` | UUID | Required source; cascade content deletion with document |
| `sourceExecutionId` | UUID | Execution that created the current report |
| `title` | text | User-visible title |
| `content` | JSONB | Validated report sections; private workspace data |
| `revision` | integer | Incremented only on an approved replacement |
| `createdAt`, `updatedAt` | timestamptz | Audit timestamps |

### Approval and PendingReport

`Approval` records `id`, `workspaceId`, `executionId`, `executionStepId`,
`actionType` (`replace_report`), `targetReportId`, `expectedReportRevision`,
`status` (`pending`, `approved`, `rejected`, `cancelled`), `requestedAt`,
`decidedAt?`, and `decidedById?`. Enforce one approval per sensitive step.
`workspaceId`, `actionType`, `targetReportId`, and `expectedReportRevision`
form the immutable scope of the approval. Only the workspace owner may retrieve
approval details or decide it.

`PendingReport` holds proposed replacement content separately from the current
`Report`: `id`, `workspaceId`, `approvalId`, `reportId`, `sourceDocumentId`,
`expectedReportRevision`, `proposedContent`, and `createdAt`. It is visible only
through the owner-authorized approval detail flow while the approval is pending.
Its `workspaceId`, `reportId`, and `expectedReportRevision` MUST match the
linked `Approval.workspaceId`, `Approval.targetReportId`, and
`Approval.expectedReportRevision`. The proposed content is returned only by
the approval detail endpoint, never by the approval list. It is deleted on
approval, rejection, cancellation, or source-document removal.

### OutboxEvent

The outbox is a private infrastructure table with `id`, `eventType`,
`aggregateId`, minimal identifier-only `payload`, `createdAt`, `publishedAt?`,
and `attemptCount`. Enforce a unique event key for deduplication. It contains no
workspace content. A dispatcher publishes pending events to BullMQ and marks
them published; duplicate delivery is safe.

## Relationships and Tenant Integrity

- `User 1—N Session` and `User 1—N Workspace`.
- `Workspace 1—N Document, Workflow, Execution, Report, Approval, and
  ExecutionEvent`.
- `Workflow 1—N Execution`; each execution keeps an immutable graph snapshot.
- `Execution 1—N ExecutionStep 1—N StepAttempt`.
- `ExecutionStep 1—0..1 ExecutionArtifact`; an artifact is scoped to the same
  workspace and execution as its step.
- `ExecutionStep 1—0..1 Approval`; a replacement approval may have one
  `PendingReport`.
- `Document 1—N Execution` (nullable reference) and `Document 1—N Report`.
- Add composite unique keys on `(workspaceId, id)` and composite foreign keys
  for workspace-owned relations. A relation with a mismatched workspace must
  fail at the database boundary.
- Apply RLS to every workspace-owned table. Workspace policies use
  transaction-local `app.workspace_id`; workspace lookup additionally checks
  `app.user_id` against `ownerId`. Missing context denies access.

## Validation and Indexes

- Parse workflow `definition` using the shared discriminated Zod schema:
  reject unknown action kinds, unknown fields, invalid config, dangling edges,
  duplicate IDs, cycles, invalid condition branches, more than 25 nodes, or
  more than 60 edges. Require one root, all nodes reachable from it, and
  condition nodes with exactly one `true` and one `false` outgoing edge.
  Conditions use a fixed operator set; they never evaluate JavaScript or
  expressions.
- Check file signature and size independently of browser MIME/extension.
  Enforce 20 MB, 100 native PDF pages, and a 300,000-character extracted-text
  limit for DOCX/TXT; fail scanned/no-text, encrypted, corrupt, and unsupported
  files with stable error codes.
- Validate AI structured output with the same workflow/report schemas before
  returning a proposal or persisting content.
- Index normalized `User.email`; `(ownerId, createdAt)` on workspaces;
  `(workspaceId, updatedAt)` on workflows; `(workspaceId, createdAt)` on
  documents, reports, and executions; `(workspaceId, status, createdAt)` on
  executions and approvals; and all relation foreign keys.
- Unique constraints: session token hash, `(workspaceId, createdById,
  idempotencyKey)`, one current report per `(workspaceId, sourceExecutionId)`,
  `(executionId, nodeId)`, `(executionStepId, attemptNumber)`, one artifact per
  `(workspaceId, executionStepId)`, and approval per execution step.

## Lifecycle and Deletion

- **Document**: `uploading → validating → ready | failed`; removal immediately
  changes it to `deleting` and denies all new access/runs. In one database
  transaction, delete linked reports and pending report content, cancel
  pending approvals, detach execution document references, and emit an object
  deletion outbox event. The worker retries source/text object deletion and
  then purges the document metadata. Retain only content-free execution and
  error status.
- **Execution**: `queued → running → succeeded | failed | cancelled`; a
  sensitive replacement changes it to `waiting_approval → running` after
  approval or `cancelled` after rejection. A deleted source cancels a waiting
  approval and prevents late worker results from being persisted.
- **Step**: `pending → running → succeeded | failed | skipped`; a sensitive
  replacement can be `waiting_approval`. Retrying a failed safe step creates a
  new `StepAttempt`; completed steps are not rerun. Its `ExecutionArtifact`
  remains available to downstream steps until the execution reaches a terminal
  state.
- **Approval**: `pending → approved | rejected | cancelled`. Detail retrieval
  and decisions are owner-only; decisions are one-time and recorded. Approval
  locks or otherwise atomically guards the target report and verifies
  `Report.revision` equals `Approval.expectedReportRevision` and
  `PendingReport.expectedReportRevision` before replacing content and incrementing
  the report revision. A stale revision returns a conflict, cancels the approval
  and execution, discards pending content, and leaves the report unchanged.
  Rejection likewise discards the proposal and cancels the execution.
