import type { Tx } from "../../db";
import type { TaskService } from "../../tasks";
import { processRepository } from "../db";
import { type OutcomeRule, outcomeOf, type ProcessRunFields, type RunStep } from "../domain";
import type { DefinitionReader } from "./runStarter";

/** Tells other modules, before the commit, that runs finished or were cancelled, with their outcome. */
export interface RunEndings {
  /**
   * Publishes `processes.run_ended` for each of these runs that is no longer in progress, with its
   * outcome and who gave it, as the outcome step's task stores them.
   */
  publishEnded(tx: Tx, runs: readonly EndingRun[]): Promise<void>;
  /** Each of these versions' outcome rule, by version id, read in one query. */
  readOutcomeRules(tx: Tx, versionIds: readonly string[]): Promise<Map<string, OutcomeRule | null>>;
}

/** A run as it is about to be saved, with its steps. */
export type EndingRun = ProcessRunFields & { steps: readonly RunStep[] };

export function createRunEndings({
  definitionOf,
  tasks,
}: {
  definitionOf: DefinitionReader;
  tasks: TaskService;
}): RunEndings {
  const readOutcomeRules: RunEndings["readOutcomeRules"] = async (tx, versionIds) => {
    const versions = await processRepository(tx).findVersions([...new Set(versionIds)]);
    return new Map(versions.map((version) => [version.id, definitionOf(version).outcome]));
  };

  return {
    async publishEnded(tx, runs) {
      const ended = runs.filter(({ status }) => status !== "in_progress");
      if (ended.length === 0) return;
      const processes = await processRepository(tx).findProcessesByIds([
        ...new Set(ended.map(({ processId }) => processId)),
      ]);
      const keyOf = new Map(processes.map(({ id, key }) => [id, key]));
      const ruleOf = await readOutcomeRules(tx, ended.map(versionIdOf));
      const outcomes = new Map(
        ended.map((run) => [run.id, outcomeOf(ruleOf.get(versionIdOf(run))!, run)]),
      );
      const doerOf = await readDoers(tx, tasks, [...outcomes.values()]);
      for (const run of ended) {
        const step = outcomes.get(run.id);
        tx.publish("processes.run_ended", {
          runId: run.id,
          processKey: keyOf.get(run.processId)!,
          recordType: run.recordType,
          recordId: run.recordId,
          status: run.status === "finished" ? "finished" : "cancelled",
          outcome: step
            ? { ...step.result, byEmployeeId: (step.taskId && doerOf.get(step.taskId)) ?? null }
            : null,
        });
      }
    },

    readOutcomeRules,
  };
}

/** Who finished each outcome task that is still there, by task id. */
async function readDoers(
  tx: Tx,
  tasks: TaskService,
  steps: readonly ({ taskId: string | null } | null)[],
): Promise<Map<string, string | null>> {
  const taskIds = steps.flatMap((step) => (step?.taskId ? [step.taskId] : []));
  if (taskIds.length === 0) return new Map();
  const found = await tasks.readTasksInTransaction(tx, taskIds);
  return new Map(found.map(({ id, doneByEmployeeId }) => [id, doneByEmployeeId]));
}

function versionIdOf({ processVersionId }: { processVersionId: string }): string {
  return processVersionId;
}
