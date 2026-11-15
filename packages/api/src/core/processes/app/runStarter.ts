import type { Tx } from "../../db";
import type { RecordProcessCapabilities } from "../../records";
import { addDays, type CalendarDate } from "../../../utils";
import { type NewRunRow, processRepository, type StoredProcess } from "../db";
import {
  type DayOffset,
  dueTriggerDate,
  type ProcessDefinition,
  type ProcessRunFields,
  type RecordDateTrigger,
  type RunStep,
  type StartCause,
  type TriggerEvent,
} from "../domain";
import type { PeoplePort, RunSubject } from "../ports";
import type { StepStarter } from "./stepStarter";

/** What processes may do with each record type that registered its process capabilities. */
export type ProcessRecordTypes = Readonly<Record<string, RecordProcessCapabilities>>;

/** A stored version's definition, parsed against what the modules registered. */
export type DefinitionReader = (version: {
  schemaVersion: number;
  definition: unknown;
}) => ProcessDefinition;

/** What starting one run needs; the caller holds the process's lock and has checked it may start. */
export interface RunStart {
  process: StoredProcess;
  definition: ProcessDefinition;
  /** The record the run is about. */
  record: { recordType: string; recordId: string };
  /** The person the run is about: the employee, or a task's subject; null for nobody. */
  subject: RunSubject | null;
  startCause: StartCause;
  startedByEmployeeId: string | null;
  triggerDate: CalendarDate | null;
  triggerEvent: TriggerEvent | null;
  startKey: string | null;
  startDay: CalendarDate;
}

/** Starts runs: whom they are about, when they are due, and storing them with their first steps. */
export interface RunStarter {
  /**
   * The subject of each record among these that still exists, by record id: the person it is
   * about, null for nobody. A record that is gone is left out.
   */
  readRecordSubjects(
    tx: Tx,
    recordType: string,
    recordIds: readonly string[],
  ): Promise<Map<string, RunSubject | null>>;
  /**
   * Trusted: creates the runs, a progress row for every step and the tasks of the steps that wait
   * for nothing, in `tx`, as Broccoli, with each run as its tasks' cause, in a fixed number of
   * statements; a run with nothing left to do is finished at once. Returns the runs in the order
   * of `starts`.
   */
  startMany(tx: Tx, starts: readonly RunStart[]): Promise<ProcessRunFields[]>;
  /** The records whose date triggers a run today, with the date it triggered on. */
  findDue(
    tx: Tx,
    trigger: RecordDateTrigger,
    days: { today: CalendarDate; turnedOnDay: CalendarDate },
  ): Promise<{ recordId: string; triggerDate: CalendarDate }[]>;
}

export function createRunStarter({
  people,
  recordTypes,
  steps,
}: {
  people: PeoplePort;
  recordTypes: ProcessRecordTypes;
  steps: StepStarter;
}): RunStarter {
  const readPeople = (tx: Tx, ids: readonly string[]) =>
    ids.length === 0 ? Promise.resolve(new Map<string, RunSubject>()) : people.readPeople(tx, ids);

  return {
    async readRecordSubjects(tx, recordType, recordIds) {
      const subjectIds = await recordTypes[recordType]!.readSubjects(tx, [...new Set(recordIds)]);
      const found = await readPeople(
        tx,
        [...subjectIds.values()].flatMap((id) => (id ? [id] : [])),
      );
      return new Map(
        [...subjectIds].map(([recordId, subjectId]) => [
          recordId,
          subjectId ? (found.get(subjectId) ?? null) : null,
        ]),
      );
    },

    async startMany(tx, starts) {
      if (starts.length === 0) return [];
      const firstSteps = await steps.planFirstSteps(tx, starts);
      const now = new Date();
      const runs = await processRepository(tx).insertRuns(
        starts.map((start, index) => newRun(start, firstSteps[index]!.progress, now)),
      );
      await steps.saveFirstSteps(
        tx,
        runs.map((run, index) => ({
          ...starts[index]!,
          run,
          processKey: starts[index]!.process.key,
          first: firstSteps[index]!,
        })),
      );
      return runs;
    },

    async findDue(tx, trigger, days) {
      // A record's trigger date is at most the offset's span away from its date.
      const span = spanOf(trigger.offset) + trigger.maxDaysLate;
      const dates = await recordTypes[trigger.recordType]!.findByDateBetween!(tx, {
        field: trigger.dateField,
        from: addDays(days.today, -span),
        until: addDays(days.today, span),
      });
      return [...dates].flatMap(([recordId, date]) => {
        const triggerDate = dueTriggerDate(trigger, date, days);
        return triggerDate ? [{ recordId, triggerDate }] : [];
      });
    },
  };
}

function newRun(start: RunStart, progress: readonly RunStep[], now: Date) {
  const finished = progress.every(
    ({ status }) => status === "step_completed" || status === "step_skipped",
  );
  return {
    processId: start.process.id,
    processVersionId: start.process.activeVersion.id,
    recordType: start.record.recordType,
    recordId: start.record.recordId,
    subjectEmployeeId: start.subject?.id ?? null,
    startCause: start.startCause,
    startedByEmployeeId: start.startedByEmployeeId,
    triggerDate: start.triggerDate,
    triggerEvent: start.triggerEvent,
    startKey: start.startKey,
    startDay: start.startDay,
    status: finished ? "finished" : "in_progress",
    finishedAt: finished ? now : null,
    cancelledAt: null,
    cancelledByEmployeeId: null,
    cancelCause: null,
    cancelReason: null,
  } satisfies NewRunRow;
}

/** How far a trigger date can be from its record's date: business days stretch by weekends and holidays. */
function spanOf({ amount, unit }: DayOffset): number {
  return unit === "calendar_days" ? Math.abs(amount) : Math.abs(amount) * 2 + 14;
}
