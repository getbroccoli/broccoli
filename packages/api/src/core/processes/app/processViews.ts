import type { CalendarDate } from "../../../utils";
import type { TaskResult, TaskStatus } from "../../tasks";
import type { ProcessRunFields as StoredRun, RunStatus, RunStep } from "../domain";

// The shapes the process service returns.

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
  result: TaskResult | null;
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

/** How far a run is, as one of its tasks' readers may see it: never the other steps. */
export interface StepProgress {
  processName: string;
  subjectEmployeeId: string | null;
  status: RunStatus;
  /** When it finished or was cancelled. */
  endedAt: Date | null;
  doneSteps: number;
  totalSteps: number;
  /** Whether this task's step gives the run its outcome. */
  decidesOutcome: boolean;
  /** On the outcome step's own task once given; null otherwise. */
  outcome: RunOutcome | null;
}

/** A run's outcome as its outcome step's readers see it: the result, labelled as an outcome. */
export interface RunOutcome {
  code: string;
  label: string;
  comment: string | null;
  /** Who gave it; null once they are removed. */
  byEmployeeId: string | null;
  at: Date;
}
