import type { ExecutionStatus, Prisma, PrismaClient, StepStatus } from "@flowpilot/db";
import { z } from "zod";
import { withTenantTransaction } from "@flowpilot/db/tenant-transaction";

const EXECUTION_TRANSITIONS: Readonly<
  Record<ExecutionStatus, readonly ExecutionStatus[]>
> = {
  queued: ["running", "failed", "cancelled"],
  running: ["waiting_approval", "succeeded", "failed", "cancelled"],
  waiting_approval: ["running", "failed", "cancelled"],
  succeeded: [],
  failed: [],
  cancelled: [],
};

const STEP_TRANSITIONS: Readonly<Record<StepStatus, readonly StepStatus[]>> = {
  pending: ["running", "skipped"],
  running: ["waiting_approval", "succeeded", "failed", "skipped"],
  waiting_approval: ["running", "failed", "skipped"],
  succeeded: [],
  failed: ["running"],
  skipped: [],
};

const SafeDetailsSchema = z
  .object({
    state: z
      .string()
      .regex(/^[a-z_]{1,64}$/)
      .optional(),
    errorCode: z
      .string()
      .regex(/^[A-Z0-9_]{1,64}$/)
      .optional(),
    attemptNumber: z.number().int().nonnegative().optional(),
    elapsedMs: z.number().int().nonnegative().optional(),
  })
  .strict();

export type SafeEventDetails = z.infer<typeof SafeDetailsSchema>;

export class InvalidStateTransitionError extends Error {
  constructor(from: string, to: string) {
    super(`State transition from ${from} to ${to} is not allowed.`);
    this.name = "InvalidStateTransitionError";
  }
}

export function assertExecutionTransition(
  from: ExecutionStatus,
  to: ExecutionStatus,
): void {
  if (!EXECUTION_TRANSITIONS[from].includes(to)) {
    throw new InvalidStateTransitionError(from, to);
  }
}

export function assertStepTransition(from: StepStatus, to: StepStatus): void {
  if (!STEP_TRANSITIONS[from].includes(to)) {
    throw new InvalidStateTransitionError(from, to);
  }
}

export async function appendExecutionEvent(
  transaction: Prisma.TransactionClient,
  input: {
    readonly workspaceId: string;
    readonly executionId: string;
    readonly executionStepId?: string;
    readonly eventType: string;
    readonly details: SafeEventDetails;
  },
): Promise<void> {
  const details = SafeDetailsSchema.parse(input.details);
  await transaction.executionEvent.create({
    data: {
      workspaceId: input.workspaceId,
      executionId: input.executionId,
      ...(input.executionStepId ? { executionStepId: input.executionStepId } : {}),
      eventType: input.eventType,
      safeDetails: details,
    },
  });
}

export async function transitionExecution(
  client: PrismaClient,
  input: {
    readonly userId: string;
    readonly workspaceId: string;
    readonly executionId: string;
    readonly to: ExecutionStatus;
    readonly errorCode?: string;
  },
): Promise<void> {
  await withTenantTransaction(client, input, async (transaction) => {
    const execution = await transaction.execution.findUnique({
      where: {
        workspaceId_id: { workspaceId: input.workspaceId, id: input.executionId },
      },
      select: { status: true, startedAt: true },
    });
    if (!execution) throw new Error("Execution was not found in the workspace.");
    assertExecutionTransition(execution.status, input.to);

    const updated = await transaction.execution.updateMany({
      where: {
        workspaceId: input.workspaceId,
        id: input.executionId,
        status: execution.status,
      },
      data: {
        status: input.to,
        ...(input.to === "running" && !execution.startedAt
          ? { startedAt: new Date() }
          : {}),
        ...(["succeeded", "failed", "cancelled"].includes(input.to)
          ? { finishedAt: new Date() }
          : {}),
        ...(input.errorCode ? { errorCode: input.errorCode } : {}),
      },
    });
    if (updated.count !== 1) {
      throw new InvalidStateTransitionError(execution.status, input.to);
    }

    await appendExecutionEvent(transaction, {
      workspaceId: input.workspaceId,
      executionId: input.executionId,
      eventType: "execution.state_changed",
      details: {
        state: input.to,
        ...(input.errorCode ? { errorCode: input.errorCode } : {}),
      },
    });
  });
}

export async function transitionExecutionStep(
  client: PrismaClient,
  input: {
    readonly userId: string;
    readonly workspaceId: string;
    readonly executionId: string;
    readonly executionStepId: string;
    readonly to: StepStatus;
    readonly errorCode?: string;
  },
): Promise<void> {
  await withTenantTransaction(client, input, async (transaction) => {
    const step = await transaction.executionStep.findUnique({
      where: {
        workspaceId_id: {
          workspaceId: input.workspaceId,
          id: input.executionStepId,
        },
      },
      select: { status: true, executionId: true },
    });
    if (!step || step.executionId !== input.executionId) {
      throw new Error("Execution step was not found in the workspace.");
    }
    assertStepTransition(step.status, input.to);

    const updated = await transaction.executionStep.updateMany({
      where: {
        workspaceId: input.workspaceId,
        id: input.executionStepId,
        executionId: input.executionId,
        status: step.status,
      },
      data: { status: input.to },
    });
    if (updated.count !== 1) {
      throw new InvalidStateTransitionError(step.status, input.to);
    }

    await appendExecutionEvent(transaction, {
      workspaceId: input.workspaceId,
      executionId: input.executionId,
      executionStepId: input.executionStepId,
      eventType: "execution_step.state_changed",
      details: {
        state: input.to,
        ...(input.errorCode ? { errorCode: input.errorCode } : {}),
      },
    });
  });
}
