import type { TaskResult } from "../../tasks";
import type { OutcomeRule } from "./processDefinition";
import type { ProcessRunFields, RunStep } from "./processRun";

/**
 * The outcome step's row of a finished run, once completed with a result; null without an outcome
 * step, before it is given, and for a cancelled run, whose decision no longer stands.
 */
export function outcomeOf(
  rule: OutcomeRule | null,
  run: Pick<ProcessRunFields, "status"> & { steps: readonly RunStep[] },
): (RunStep & { result: TaskResult }) | null {
  if (run.status === "cancelled") return null;
  const step = rule && run.steps.find(({ stepKey }) => stepKey === rule.step);
  return step?.status === "step_completed" && step.result
    ? (step as RunStep & { result: TaskResult })
    : null;
}
