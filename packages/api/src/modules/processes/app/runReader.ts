import { ApplicationError } from "../../../core/applicationError";
import type { Orm, Transact, Tx } from "../../../core/db";
import { parseUuid } from "../../../utils";
import type { Task, TaskService } from "../../tasks";
import { processRepository, type StoredProcess } from "../db";
import type { ProcessRun as StoredRun, RunStep } from "../domain";
import type { ProcessRun, ProcessRunDetails, ProcessRunStep } from "./processViews";
import type { RunStarter } from "./runStarter";

/** Finds processes and runs for the other process services, and reads runs as callers see them. */
export interface RunReader {
  /** The process with this key; NOT_FOUND when there is none. */
  requireProcess(db: Orm | Tx, processKey: string): Promise<StoredProcess>;
  /** The run with this id; NOT_FOUND when there is none. */
  requireRun(db: Orm | Tx, runId: string): Promise<StoredRun>;
  /** The run and its steps, read with the run locked so a step change cannot show half done. */
  readDetails(run: StoredRun): Promise<ProcessRunDetails>;
  /** The run with the name of its process. */
  view(run: StoredRun, process: StoredProcess): ProcessRun;
}

export function createRunReader({
  transact,
  tasks,
  starter,
}: {
  transact: Transact;
  tasks: TaskService;
  starter: RunStarter;
}): RunReader {
  return {
    async requireProcess(db, processKey) {
      const process = await processRepository(db).findProcessByKey(processKey);
      if (!process) throw new ApplicationError("NOT_FOUND", "No process has this key.");
      return process;
    },

    async requireRun(db, runId) {
      const id = parseUuid(runId);
      const run = id ? await processRepository(db).findRun(id) : null;
      if (!run) throw new ApplicationError("NOT_FOUND", "No process run has this id.");
      return run;
    },

    readDetails: (run) =>
      transact(async (tx) => {
        const runs = processRepository(tx);
        const current = (await runs.lockRun(run.id))!;
        const [process] = await runs.findProcessesByIds([current.processId]);
        const steps = await runs.findSteps(current.id);
        const taskIds = steps.flatMap(({ taskId }) => (taskId ? [taskId] : []));
        const runTasks = await tasks.readTasksInTransaction(tx, taskIds);
        const titles = await starter.stepTitles(tx, current);
        return {
          run: runView(current, process!),
          steps: [...titles].flatMap(([key, title]) =>
            steps
              .filter(({ stepKey }) => stepKey === key)
              .map((step) => stepView(step, title, runTasks)),
          ),
        };
      }),

    view: runView,
  };
}

function runView(run: StoredRun, process: StoredProcess): ProcessRun {
  return {
    id: run.id,
    processKey: process.key,
    processName: process.name,
    record: { recordType: run.recordType, recordId: run.recordId },
    subjectEmployeeId: run.subjectEmployeeId,
    startCause: run.startCause,
    startedByEmployeeId: run.startedByEmployeeId,
    startDay: run.startDay,
    status: run.status,
    finishedAt: run.finishedAt,
    cancelledAt: run.cancelledAt,
    cancelledByEmployeeId: run.cancelledByEmployeeId,
    cancelCause: run.cancelCause,
    cancelReason: run.cancelReason,
    createdAt: run.createdAt,
  };
}

/** A step with its task's title, or the version's title for a step without a task. */
function stepView(step: RunStep, title: string, runTasks: readonly Task[]): ProcessRunStep {
  const task = runTasks.find(({ id }) => id === step.taskId);
  return {
    key: step.stepKey,
    title: task?.title ?? title,
    status: step.status,
    assigneeNote: step.assigneeNote,
    skipReason: step.skipReason,
    finishedAt: step.finishedAt,
    task: task
      ? {
          id: task.id,
          assigneeEmployeeId: task.assigneeEmployeeId,
          dueDate: task.dueDate,
          status: task.status,
        }
      : null,
  };
}
