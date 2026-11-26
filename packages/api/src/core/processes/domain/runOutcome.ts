import type { TaskResult } from "../../tasks";
import type { OutcomeRule } from "./processDefinition";
import type { RunStep } from "./processRun";

/** The outcome step's row once it was completed with a result; null without an outcome or before. */
export function outcomeOf(
  rule: OutcomeRule | null,
  steps: readonly RunStep[],
): (RunStep & { result: TaskResult }) | null {
  const step = rule && steps.find(({ stepKey }) => stepKey === rule.step);
  return step?.status === "step_completed" && step.result
    ? (step as RunStep & { result: TaskResult })
    : null;
}
