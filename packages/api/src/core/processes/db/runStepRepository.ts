import { and, eq, inArray } from "drizzle-orm";

import { ormOf, type Orm, type Tx } from "../../db";
import type { RunStep } from "../domain";
import { INSERT_BATCH_SIZE } from "./processRepository";
import { resultColumnsOf, runStepProgress, toRunStep } from "./processRunsTable";

/** Stored progress of runs' steps, read and written without their run. */
export interface RunStepRepository {
  insertSteps(steps: readonly RunStep[]): Promise<void>;
  /** Writes steps that were waiting as started or not reached: their status, task, note or skip reason. */
  saveDecidedSteps(steps: readonly RunStep[]): Promise<void>;
  /** The run's steps, in no particular order. */
  findSteps(runId: string): Promise<RunStep[]>;
  /** The steps whose tasks are among these, whatever their run. */
  findStepsByTaskIds(taskIds: readonly string[]): Promise<RunStep[]>;
}

export function runStepRepository(db: Orm | Tx): RunStepRepository {
  const orm = ormOf(db);
  return {
    async insertSteps(steps) {
      for (let start = 0; start < steps.length; start += INSERT_BATCH_SIZE) {
        await orm
          .insert(runStepProgress)
          .values(steps.slice(start, start + INSERT_BATCH_SIZE).map(toStepRow));
      }
    },

    async saveDecidedSteps(steps) {
      for (const step of steps) {
        const { runId, stepKey, ...decided } = toStepRow(step);
        await orm
          .update(runStepProgress)
          .set(decided)
          .where(
            and(
              eq(runStepProgress.runId, runId),
              eq(runStepProgress.stepKey, stepKey),
              eq(runStepProgress.status, "step_waiting_to_start"),
            ),
          );
      }
    },

    async findSteps(runId) {
      const rows = await orm.select().from(runStepProgress).where(eq(runStepProgress.runId, runId));
      return rows.map(toRunStep);
    },

    async findStepsByTaskIds(taskIds) {
      if (taskIds.length === 0) return [];
      const rows = await orm
        .select()
        .from(runStepProgress)
        .where(inArray(runStepProgress.taskId, [...taskIds]));
      return rows.map(toRunStep);
    },
  };
}

function toStepRow({ result, ...step }: RunStep) {
  return { ...step, ...resultColumnsOf({ result }) };
}
