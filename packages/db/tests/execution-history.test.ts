import { describe, expect, it } from "vitest";
import { isManualRetryEligible } from "../src/repositories/execution-history.repository.js";

describe("manual execution retry eligibility", () => {
  it("allows only transient failures of repeatable steps below the retry bound", () => {
    expect(
      isManualRetryEligible({
        actionType: "analyze_document",
        attemptNumber: 4,
        errorCode: "DEPENDENCY_UNAVAILABLE",
        status: "failed",
      }),
    ).toBe(true);

    for (const input of [
      {
        actionType: "create_report",
        attemptNumber: 1,
        errorCode: "DEPENDENCY_UNAVAILABLE",
        status: "failed",
      },
      {
        actionType: "analyze_document",
        attemptNumber: 1,
        errorCode: "WORKFLOW_INVALID",
        status: "failed",
      },
      {
        actionType: "analyze_document",
        attemptNumber: 5,
        errorCode: "DEPENDENCY_UNAVAILABLE",
        status: "failed",
      },
      {
        actionType: "analyze_document",
        attemptNumber: 1,
        errorCode: "DEPENDENCY_UNAVAILABLE",
        status: "succeeded",
      },
    ]) {
      expect(isManualRetryEligible(input)).toBe(false);
    }
  });
});
