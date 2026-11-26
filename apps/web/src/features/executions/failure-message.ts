const FAILURE_MESSAGES: Record<string, string> = {
  AI_PROVIDER_RATE_LIMITED:
    "The AI provider rate-limited this step. Wait briefly, then use Retry safely if available.",
  AI_PROVIDER_UNAVAILABLE:
    "The AI provider is temporarily unavailable. Use Retry safely once it recovers.",
  DEPENDENCY_UNAVAILABLE:
    "A required service is temporarily unavailable. Use Retry safely once it recovers.",
  DOCUMENT_NOT_READY:
    "The source document is no longer ready. Validate it again and start a new run.",
  DOCUMENT_REQUIRED:
    "This run has no ready source document. Start a new run with a document selected.",
  REPORT_CONTENT_MISSING:
    "No analysis output was available for report creation. Check the analysis step.",
  STEP_FAILED: "This step failed unexpectedly.",
  WORKFLOW_INVALID: "The workflow graph is invalid and could not be executed.",
};

export function getExecutionFailureMessage(errorCode: string | undefined): string {
  if (!errorCode) return "This step failed without an error code.";
  return (
    FAILURE_MESSAGES[errorCode] ??
    "This step failed. Review the error code above and retry only if offered."
  );
}
