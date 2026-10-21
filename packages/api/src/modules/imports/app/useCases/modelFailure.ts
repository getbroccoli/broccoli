import { ANSWER_CUT_OFF, DecisionsError } from "../../../../integrations/ai";
import type { ImportSourceFailure, MappingOutcome } from "../../domain";

/**
 * How a file fails when the model refused it for good: a reason the page words itself, or the
 * provider's own words. Rethrows anything else, such as a retryable failure, so the job runs again.
 */
export function failedModelOutcome(error: unknown): MappingOutcome {
  if (!(error instanceof DecisionsError) || error.retryable) {
    throw error;
  }
  const failure = MODEL_FAILURES.get(error.reason ?? "");
  return failure
    ? { status: "failed", failure }
    : { status: "failed", failure: "unavailable", failureMessage: error.providerMessage };
}

/** Broccoli AI's refusals that only the owner's own key gets past, and a cut-off answer. */
const MODEL_FAILURES = new Map<string, ImportSourceFailure>([
  ["free_period_used", "ai_free_period_used"],
  ["free_period_over", "ai_free_period_over"],
  ["limit_reached", "ai_limit_reached"],
  [ANSWER_CUT_OFF, "original_read_incomplete"],
]);
