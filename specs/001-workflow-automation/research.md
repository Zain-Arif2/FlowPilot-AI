# Research & Design Decisions

## Context

The feature specification and TypeScript constitution define the product scope
and primary stack. The repository currently contains no application source or
dependency manifests, so this plan establishes a TypeScript monorepo rather than
adapting an existing codebase.

## Decisions

### Monorepo and service boundaries

- **Decision**: Use one TypeScript monorepo with a Next.js web app, one Express
  API, one BullMQ worker, and small shared `contracts` and `db` packages.
- **Rationale**: The browser builder, synchronous API operations, and durable
  document/workflow jobs have distinct runtime needs. A single API and worker
  avoid turning MVP domains into separate services while preserving a deployable
  boundary for queued execution.
- **Alternatives considered**: A single Next.js server for all business logic
  would couple the specified Express API and long-running jobs to the UI
  runtime. Per-domain services would add deployment and operational complexity.
- **Web/API boundary**: Route browser `/api/v1/*` traffic to Express through a
  same-origin proxy. Next.js owns presentation only; Express owns authentication,
  authorization, persistence, uploads, AI requests, and queue publication.

### TypeScript contracts and validation

- **Decision**: Enable TypeScript `strict` mode in every application and
  package. Define shared Zod schemas in `packages/shared`; derive TypeScript
  types from those schemas and use them on the client and server. Add
  `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, and a lint rule
  rejecting `any`; any exception requires a nearby documented justification.
- **Rationale**: Runtime data from browsers, object storage, queues, and AI is
  untrusted regardless of compile-time types. A shared runtime schema keeps
  validation authoritative and minimizes contract drift.
- **Alternatives considered**: Duplicated frontend/backend interfaces and
  generated AI types alone do not validate network or model responses.
- **Sources**: [Zod](https://zod.dev/) describes TypeScript-first runtime
  validation and static type inference.

### Workspace isolation and database access

- **Decision**: Scope every workspace-owned query by `workspaceId` and enforce
  PostgreSQL row-level security (RLS) as defense in depth. Set the authenticated
  `userId` and verified `workspaceId` transaction-locally in the same Prisma
  transaction as the protected queries. Apply RLS policies with default-deny
  behavior to every workspace-owned table. The application role MUST NOT own
  those tables or have `BYPASSRLS`; migrations use a separate privileged role.
  Add composite workspace foreign keys so rows cannot refer across tenants.
- **Rationale**: Application predicates provide clear domain authorization;
  RLS limits damage from an accidentally unscoped query. PostgreSQL documents
  default-deny behavior when RLS is enabled without an applicable policy and
  notes that table owners normally bypass policies, so the runtime role must be
  distinct from the migration owner.
- **Connection handling**: Use Neon's pooled endpoint for long-running runtime
  services and a direct endpoint for migrations. Keep tenant context inside an
  explicit transaction using transaction-local settings, never session state
  that could leak across pooled connections. Add an integration test against
  the pooled Neon connection before release.
- **Alternatives considered**: Application filtering alone is weaker against a
  missed predicate. A database role per workspace is not practical for dynamic
  user-created workspaces.
- **Sources**: [PostgreSQL row security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html),
  [Neon connection pooling](https://neon.com/docs/connect/connection-pooling),
  [Prisma transactions](https://www.prisma.io/docs/orm/fundamentals/transactions),
  and [Prisma database connections](https://www.prisma.io/docs/orm/v7/prisma-client/setup-and-configuration/databases-connections).

### Authentication and sessions

- **Decision**: Use email-and-password authentication for the MVP. Hash
  passwords with Argon2id. Issue a cryptographically random opaque session
  token in an `HttpOnly`, `Secure`, `SameSite=Lax` cookie; store only a hash of
  the token, rotate or revoke sessions on authentication changes, and validate
  request origin/CSRF protections for state-changing cookie-authenticated
  requests. The sole workspace owner is the only member.
- **Rationale**: This supplies the registration and sign-in flows without
  introducing an unspecified identity provider. OWASP recommends adaptive
  password hashing and high-entropy session identifiers with secure cookie
  protections.
- **Alternatives considered**: Browser-stored bearer tokens increase exposure
  to script injection. External identity providers and invitations are outside
  the defined MVP scope.
- **Sources**: [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
  and [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html).

### Document storage and removal

- **Decision**: Keep source documents and derived extracted text in a private
  hosted S3-compatible object store. Issue short-lived, object-specific
  upload/download URLs only after workspace authorization. Use random immutable
  object keys, verify uploaded size/type and parse results server-side, and
  never trust the browser's filename or MIME type.
- **Rationale**: Object storage avoids putting large binary files in Neon and
  keeps file delivery independent from API process memory. AWS documents that
  presigned URLs grant the permissions of their creator and can replace an
  object at the same key; random keys, short expiry, and immutable finalized
  objects prevent that behavior from becoming an overwrite path.
- **Removal behavior**: Revoke access immediately in the database, remove
  report/proposal content and extracted text, then delete source and derived
  objects through a retryable outbox event. Preserve only content-free run
  status and error metadata as required by the spec.
- **Alternatives considered**: Storing binary data in PostgreSQL or local
  disk files couples storage to database/instance size and is not suitable
  for horizontal workers.
- **Sources**: [S3 presigned uploads](https://docs.aws.amazon.com/AmazonS3/latest/userguide/PresignedUrlUploadObject.html)
  and [S3 Block Public Access](https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-control-block-public-access.html).

### Document text extraction

- **Decision**: Use PDF.js (`pdfjs-dist`) to extract a PDF text layer and
  determine its native page count. Use Mammoth's raw-text extraction for DOCX;
  do not convert uploaded DOCX to HTML or render embedded images. Decode TXT as
  UTF-8 and reject invalid/unreadable content. Run all parsers in the isolated
  worker with CPU, memory, archive expansion, and wall-clock limits.
- **Page limit mapping**: PDF files are limited by native page count to 100.
  DOCX and TXT do not have a stable page count without imposing a renderer, so
  apply a fixed 300,000-Unicode-code-point extracted-text budget as the MVP
  equivalent of the 100-page limit. Validate this budget against the
  representative document set before release.
- **Rationale**: PDF.js provides PDF parsing/text extraction; Mammoth exposes
  raw-text extraction and warns that it does not sanitize source documents.
  Using raw text avoids rendering untrusted DOCX markup as HTML. No OCR is
  added to the MVP.
- **Alternatives considered**: Rendering every DOCX/TXT through a headless
  office suite would add a large runtime and still require choosing page
  layout rules for plain text. OCR is outside the stated MVP.
- **Sources**: [PDF.js](https://mozilla.github.io/pdf.js/) and
  [Mammoth raw text and security notes](https://raw.githubusercontent.com/mwilliamson/mammoth.js/master/README.md).

### AI workflow generation and tool execution

- **Decision**: Call the OpenRouter Chat Completions API through a narrow
  server-side adapter. Request strict JSON Schema structured output for workflow
  proposals and document-analysis results, then validate every response with
  Zod and semantic workflow rules. Select only model/provider combinations that
  support the required parameters. Use provider routing restrictions such as
  `require_parameters`, `data_collection: "deny"`, and `zdr` when supported by
  the approved provider policy; fail closed if an acceptable route is
  unavailable.
- **Tool policy**: Maintain a typed, server-owned registry of document-analysis
  and report actions with Zod argument schemas, idempotency metadata, and
  approval classification. A model tool call is a request, not execution
  authority. The server validates the tool name, arguments, workspace/document
  ownership, current workflow state, and approval requirement before running a
  handler. No `eval`, generated code, arbitrary network access, SQL, shell, or
  dynamically registered tools are allowed.
- **Rationale**: OpenRouter's structured output support is model/endpoint
  dependent, and its tool-calling protocol returns a suggested tool call for
  the application to execute. The application remains the policy enforcement
  point. Only extracted text is sent to the model; file bytes, secrets, and
  unrelated workspace data are not included. Prompts, document text, and report
  bodies are never written to logs.
- **Alternatives considered**: Parsing free-form text is less reliable.
  Automatically executing a general agent SDK loop would obscure policy
  checkpoints; keep the loop bounded and server-controlled instead.
- **Sources**: [OpenRouter structured outputs](https://openrouter.ai/docs/guides/features/structured-outputs),
  [OpenRouter client tools](https://openrouter.ai/docs/guides/features/tool-calling),
  and [OpenRouter provider routing](https://openrouter.ai/docs/guides/routing/provider-selection).

### Durable workflow execution

- **Decision**: Persist execution and step state in PostgreSQL; treat Redis and
  BullMQ as delivery/coordination, not the source of truth. Create an execution
  and its outbox event in one database transaction. An outbox dispatcher
  publishes a job containing identifiers only. Workers reload and authorize
  persisted state, then execute the saved workflow snapshot sequentially.
- **Retries and approvals**: Store each step transition/attempt before moving
  forward. Use stable BullMQ job IDs plus database idempotency constraints;
  handlers declare whether retry is safe. Retry only transient failures with
  bounded exponential backoff and jitter. Permanent validation/policy failures
  are terminal. On report replacement, persist a pending proposal and approval,
  set the execution to `waiting_approval`, and finish the queue job. An
  approval decision creates an outbox continuation job; the worker does not
  hold a Redis job lock while waiting for a person.
- **Rationale**: BullMQ documents retries, job IDs, stalled-job recovery, and
  idempotent processors. The outbox closes the database-commit/Redis-publish
  gap; the database state allows a duplicate or recovered queue job to resume
  without repeating completed steps.
- **Alternatives considered**: Keeping a worker job active while waiting for
  approval wastes concurrency and risks stalled-job recovery. Enqueuing without
  an outbox can lose or duplicate work across a crash.
- **Sources**: [BullMQ idempotent jobs](https://docs.bullmq.io/patterns/idempotent-jobs),
  [retries](https://docs.bullmq.io/guide/retrying-failing-jobs),
  [stalled jobs](https://docs.bullmq.io/guide/jobs/stalled),
  and [job IDs](https://docs.bullmq.io/guide/jobs/job-ids).

### Workflow builder, API, and tests

- **Decision**: The React Flow canvas is a client-side editor for a versioned
  graph definition; it is not the execution engine or a trust boundary.
  Serialize node IDs, approved node kinds, typed configuration, branch-labelled
  edges, and layout positions. Validate the graph on both client and server;
  only the server-validated graph can be saved or run. Use a directed acyclic
  graph with bounded nodes, no user-authored code, and explicit true/false
  condition edges.
- **API contract**: Keep endpoint schemas in shared Zod definitions and publish
  the versioned REST surface as OpenAPI. Use workspace-scoped endpoints,
  same-origin session cookies, stable error codes, optimistic workflow revision
  checks, and an `Idempotency-Key` for run creation.
- **Testing**: Vitest covers pure schemas, graph validation, state transitions,
  and tool policy. Supertest exercises the Express app and auth/error contract.
  Integration tests use separately provisioned non-production PostgreSQL,
  Redis, and S3-compatible resources. AI responses are deterministic fixtures
  in tests; a small opt-in evaluation set measures model output quality
  without making unit tests depend on a live provider.
- **Rationale**: React Flow models nodes and edges for interactive graph
  editing; Zod validates untrusted runtime values and infers TypeScript types.
  Vitest supports the TypeScript test workflow and Supertest exercises Node
  HTTP servers without requiring a separately launched listener.
- **Sources**: [React Flow quick start](https://reactflow.dev/learn),
  [Next.js rewrites](https://nextjs.org/docs/app/api-reference/config/next-config-js/rewrites),
  [Zod](https://zod.dev/), [Vitest](https://vitest.dev/guide/),
  [Supertest](https://github.com/forwardemail/supertest#readme),
  and [npm workspaces](https://docs.npmjs.com/cli/using-npm/workspaces).

## Explicit MVP Boundaries

- Support English prompts and PDF, DOCX, and TXT documents up to 20 MB and 100
  pages. Scanned PDFs without an extractable text layer, OCR, team invitations,
  external application connectors, public report publishing, and arbitrary
  user-authored code are out of scope.
- Store only sanitized execution metadata in logs. Model provider/model
  configuration and production object-store vendor are deployment settings;
  release requires verifying the chosen provider's data-handling terms and
  structured-output/tool support.
- No production availability or concurrency SLA is stated in the spec. Measure
  capacity against the listed user-visible success criteria before setting
  deployment targets.
