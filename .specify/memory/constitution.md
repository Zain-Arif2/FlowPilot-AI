<!--
Sync Impact Report
Version change: 1.0.0 -> 2.0.0
Modified principles: VI. Reusable JavaScript and Consistent Conventions ->
  VI. Reusable TypeScript and Consistent Conventions.
Added sections: none.
Removed sections: none.
Follow-up TODO: confirm the original ratification date.
-->

# FlowPilot AI Constitution

## Core Principles

### I. Modular Architecture
The system MUST use clean, modular components with clear responsibilities and
boundaries. Modules MUST expose explicit interfaces and avoid unnecessary
coupling. This keeps changes understandable, testable, and maintainable as the
platform grows.

### II. Privacy and Workspace Isolation
The system MUST protect user and workspace data and enforce workspace isolation
at every relevant data access and execution boundary. Access control MUST be
checked server-side; clients and AI-generated instructions MUST NOT be trusted
to enforce isolation. Data collection and retention MUST be limited to what
product functionality requires. These controls prevent unintended disclosure
between users and workspaces.

### III. Validation at Trust Boundaries
All user inputs and AI-generated workflow configurations MUST be validated
against explicit schemas and applicable authorization rules before they are
stored or executed. Invalid, incomplete, or unauthorized configurations MUST
fail explicitly and MUST NOT be silently repaired into executable actions.
Validation at each trust boundary prevents malformed data from becoming
unsafe behavior.

### IV. Approved AI Tooling
AI MUST invoke only predefined tools explicitly approved by the product. Tool
names, arguments, and permissions MUST be validated against the approved
tool definitions before invocation. AI output MUST NOT create or grant new
tools, permissions, or execution paths.

### V. Human Approval for Sensitive Actions
Sensitive or consequential actions MUST require explicit user approval before
execution. Approval MUST identify the action and its relevant scope, and MUST
NOT be inferred from silence, unrelated consent, or a previous approval for a
different action. This preserves meaningful user control over material
changes and external effects.

### VI. Reusable TypeScript and Consistent Conventions
TypeScript MUST be used as the primary implementation language across the
frontend and backend. Strict type checking MUST be enabled. Shared types and
interfaces MUST be used where appropriate to keep contracts consistent.
Use of `any` MUST be avoided unless a documented justification explains why
a safer type is not suitable. Code MUST follow the project's established
naming, formatting, and module conventions. Shared behavior MUST be
implemented in reusable components where doing so reduces duplication
without obscuring responsibility. These rules preserve type safety and
maintainability across the application.

### VII. Meaningful Automated Tests
Important functionality MUST have appropriate unit and integration tests.
Tests MUST cover relevant success paths, validation failures, authorization
boundaries, and failure behavior for the change. Changes MUST pass the
applicable automated checks before they are considered complete.

### VIII. Reliable Execution and Observability
Execution failures MUST be surfaced clearly and recorded with useful,
structured logs while excluding secrets and unnecessary personal data.
Retries MUST be bounded and used only when an operation is safe to retry;
non-idempotent actions MUST NOT be repeated without safeguards. Execution
state and outcomes MUST be traceable enough to support diagnosis without
weakening privacy or isolation.

### IX. Performance and Scalability
Changes MUST account for expected workload and avoid unnecessary resource
consumption, blocking work, and repeated expensive operations. Performance
critical paths SHOULD be measured against relevant workloads, and scaling
limits or bottlenecks MUST be addressed when evidence shows they affect
reliability or user experience.

### X. Simplicity by Default
Implementations MUST choose the simplest design that satisfies the validated
requirements. Abstractions, dependencies, configuration, and operational
mechanisms MUST have a clear benefit that justifies their ongoing cost.
Complexity that cannot be justified MUST be removed or deferred.

## Engineering Constraints

TypeScript MUST be used for FlowPilot AI frontend and backend application
code, with strict TypeScript configuration enabled. Shared types and
interfaces MUST be used where they provide consistent contracts across
application boundaries. Every use of `any` MUST have a documented
justification. Code MUST remain modular, reusable, and type-safe. New
technology and dependencies MUST have a documented compatibility, security,
and maintenance rationale. All implementations remain subject to the
principles above regardless of execution environment.

## Development Workflow

Every change MUST identify relevant security, privacy, validation, and
workspace-isolation impacts. Reviewers MUST verify that applicable tests and
quality checks pass and that the implementation follows this constitution.
Exceptions MUST be documented with their rationale, scope, risk, and an owner
for any follow-up mitigation.

## Governance

This constitution governs engineering decisions for FlowPilot AI. Amendments
MUST be proposed with their rationale and impact, reviewed and approved by
project maintainers, and recorded by updating this document and its version
and amendment date. A change to a binding principle or the addition of a new
principle requires a MINOR version increment; removal or incompatible
redefinition of a principle requires a MAJOR increment; wording clarifications
that do not change obligations require a PATCH increment.

Compliance MUST be reviewed during design and code review, including relevant
tests and operational controls. Non-compliance MUST be corrected before
release or recorded as an approved, time-bounded exception with an owner and
mitigation plan. Reviewers MUST NOT treat an undocumented exception as
approval.

**Version**: 2.0.0 | **Ratified**: TODO(RATIFICATION_DATE): confirm original adoption date | **Last Amended**: 2026-11-24
