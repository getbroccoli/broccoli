import { ApplicationError } from "../../../core/applicationError";
import { type Orm, type Transact, type Tx } from "../../../core/db";
import { type CalendarDate, parseUuid } from "../../../utils";
import type { Task, TaskService, TaskStatus } from "../../tasks";
import { processRepository, type StoredProcess } from "../db";
import {
  type ProcessDefinition,
  type ProcessRun as StoredRun,
  parseProcessDefinition,
  type RunStatus,
  type RunStep,
} from "../domain";
import { type RunStarter } from "./runStarter";

/** A process as admins see it. */
export interface Process {
  id: string;
  key: string;
  name: string;
  description: string;
  isOn: boolean;
  turnedOnAt: Date | null;
  activeVersion: { id: string; version: number };
}

/** A run with the name of its process. */
export type ProcessRun = Omit<
  StoredRun,
  | "processId"
  | "processVersionId"
  | "triggerDate"
  | "startKey"
  | "recordType"
  | "recordId"
  | "updatedAt"
> & {
  processKey: string;
  processName: string;
  record: { recordType: string; recordId: string };
};

/** One step of a run, with its task once it has one. */
export interface ProcessRunStep {
  key: string;
  /** As its task got it. */
  title: string;
  status: RunStep["status"];
  assigneeNote: RunStep["assigneeNote"];
  skipReason: RunStep["skipReason"];
  finishedAt: Date | null;
  task: {
    id: string;
    assigneeEmployeeId: string;
    dueDate: CalendarDate | null;
    status: TaskStatus;
  } | null;
}

/** A run and its steps, in the order its version lists them. */
export interface ProcessRunDetails {
  run: ProcessRun;
  steps: ProcessRunStep[];
}

/** A step's task after a step command, and its run; a run cancelled on the way says so instead of throwing. */
export interface StepChange {
  run: ProcessRun;
  task: Task;
}

/** How far a run is, as one of its tasks' readers may see it: never the other steps. */
export interface StepProgress {
  processName: string;
  subjectEmployeeId: string | null;
  status: RunStatus;
  doneSteps: number;
  totalSteps: number;
}

/** What the process service's parts share. */
export interface Deps {
  orm: Orm;
  transact: Transact;
  tasks: TaskService;
  starter: RunStarter;
  now: () => Date;
}

export async function readDetails(deps: Deps, run: StoredRun): Promise<ProcessRunDetails> {
  return deps.transact((tx) => readDetailsIn(deps, tx, run));
}

async function readDetailsIn(
  { tasks, starter }: Deps,
  tx: Tx,
  run: StoredRun,
): Promise<ProcessRunDetails> {
  const runs = processRepository(tx);
  const [process] = await runs.findProcessesByIds([run.processId]);
  const steps = await runs.findSteps(run.id);
  const taskIds = steps.flatMap(({ taskId }) => (taskId ? [taskId] : []));
  const runTasks = new Map((await tasks.readTasksInTransaction(tx, taskIds)).map((t) => [t.id, t]));
  const titles = await starter.stepTitles(tx, run);
  const ordered = [...titles.keys()].flatMap((key) =>
    steps.filter(({ stepKey }) => stepKey === key),
  );
  return {
    run: toRunView(run, process!),
    steps: ordered.map((step) => {
      const task = step.taskId ? runTasks.get(step.taskId) : undefined;
      return {
        key: step.stepKey,
        title: task?.title ?? titles.get(step.stepKey)!,
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
    }),
  };
}

export async function requireProcess(db: Orm | Tx, processKey: string): Promise<StoredProcess> {
  const process = await processRepository(db).findProcessByKey(processKey);
  if (!process) throw new ApplicationError("NOT_FOUND", "No process has this key.");
  return process;
}

export async function requireRun(db: Orm | Tx, runId: string): Promise<StoredRun> {
  const id = parseUuid(runId);
  const run = id ? await processRepository(db).findRun(id) : null;
  if (!run) throw new ApplicationError("NOT_FOUND", "No process run has this id.");
  return run;
}

export function runIdOf(task: Task): string {
  const runId = task.type === "process_step_to_do" ? task.processSource?.processRunId : null;
  if (!runId) throw new ApplicationError("CONFLICT", "This task does not belong to a process.");
  return runId;
}

export function definitionOf({ activeVersion }: StoredProcess): ProcessDefinition {
  return parseProcessDefinition(activeVersion.schemaVersion, activeVersion.definition);
}

export function subjectOf(run: StoredRun): string {
  return run.subjectEmployeeId ?? "public";
}

export function toProcess({
  id,
  key,
  name,
  description,
  turnedOnAt,
  activeVersion,
}: StoredProcess): Process {
  return {
    id,
    key,
    name,
    description,
    isOn: turnedOnAt !== null,
    turnedOnAt,
    activeVersion: { id: activeVersion.id, version: activeVersion.version },
  };
}

export function toRunView(run: StoredRun, process: StoredProcess): ProcessRun {
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
