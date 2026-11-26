import type { Tx } from "../../db";
import { processRepository } from "../db";
import { type OutcomeRule, outcomeOf, type ProcessRunFields, type RunStep } from "../domain";
import type { DefinitionReader } from "./runStarter";

/** Tells other modules, before the commit, that runs finished or were cancelled, with their outcome. */
export interface RunEndings {
  /**
   * Publishes `processes.run_ended` for each of these runs that is no longer in progress;
   * `decidedBy` gives who finished each done task, by task id, as far as the caller knows.
   */
  publishEnded(
    tx: Tx,
    runs: readonly (ProcessRunFields & { steps: readonly RunStep[] })[],
    decidedBy?: ReadonlyMap<string, string | null>,
  ): Promise<void>;
}

export function createRunEndings({ definitionOf }: { definitionOf: DefinitionReader }): RunEndings {
  return {
    async publishEnded(tx, runs, decidedBy = new Map()) {
      const ended = runs.filter(({ status }) => status !== "in_progress");
      if (ended.length === 0) return;
      const repository = processRepository(tx);
      const processes = await repository.findProcessesByIds([
        ...new Set(ended.map(({ processId }) => processId)),
      ]);
      const keyOf = new Map(processes.map(({ id, key }) => [id, key]));
      const outcomeRuleOf = new Map<string, OutcomeRule | null>();
      for (const versionId of new Set(ended.map(({ processVersionId }) => processVersionId))) {
        outcomeRuleOf.set(
          versionId,
          definitionOf((await repository.findVersion(versionId))!).outcome,
        );
      }
      for (const run of ended) {
        const outcome = outcomeRuleOf.get(run.processVersionId)!;
        const step = outcomeOf(outcome, run.steps);
        tx.publish("processes.run_ended", {
          runId: run.id,
          processKey: keyOf.get(run.processId)!,
          recordType: run.recordType,
          recordId: run.recordId,
          status: run.status === "finished" ? "finished" : "cancelled",
          outcome: step && {
            ...step.result,
            byEmployeeId: (step.taskId && decidedBy.get(step.taskId)) ?? null,
          },
        });
      }
    },
  };
}
