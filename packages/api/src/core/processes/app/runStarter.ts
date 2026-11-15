import type { Tx } from "../../db";
import type { RecordProcessCapabilities } from "../../records";
import { PrincipalSecurityContext } from "../../security";
import { addDays, type CalendarDate } from "../../../utils";
import type { NewTask, TaskService } from "../../tasks";
import { type NewRunRow, processRepository, type StoredProcess } from "../db";
import {
  addDayOffset,
  type AssigneeRule,
  type DayOffset,
  dueTriggerDate,
  type IsWorkingDay,
  type ProcessDefinition,
  type ProcessRun,
  type ProcessRunFields,
  type RecordDateTrigger,
  resolveAssignee,
  type RunStep,
  type StartCause,
  startReadySteps,
  type StepStart,
  type TaskStep,
  type TriggerEvent,
} from "../domain";
import type { PeoplePort, RunSubject, WorkingCalendarsPort } from "../ports";

/** A process's own task type: a step's to-do, whose done step processes follows. */
export const PROCESS_STEP_TO_DO = "process_step_to_do";

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

/** Starts runs and their steps: the steps' assignees, tasks and due dates. */
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
  /**
   * Trusted, under the run's lock: starts its waiting steps whose listed steps are all done,
   * giving their tasks to whom their rules name on `day`, and saves them. Returns the run with
   * them, finished when nothing is left to do.
   */
  startReadySteps(tx: Tx, run: ProcessRun, day: CalendarDate): Promise<ProcessRun>;
  /** The records whose date triggers a run today, with the date it triggered on. */
  findDue(
    tx: Tx,
    trigger: RecordDateTrigger,
    days: { today: CalendarDate; turnedOnDay: CalendarDate },
  ): Promise<{ recordId: string; triggerDate: CalendarDate }[]>;
  /** Each step's title as its task gets it, in the order the run's version lists the steps. */
  stepTitles(tx: Tx, run: ProcessRunFields): Promise<Map<string, string>>;
}

export function createRunStarter({
  tasks,
  people,
  workingCalendars,
  recordTypes,
  definitionOf,
}: {
  tasks: TaskService;
  people: PeoplePort;
  workingCalendars: WorkingCalendarsPort;
  recordTypes: ProcessRecordTypes;
  definitionOf: DefinitionReader;
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
      const candidates = await readCandidates(
        people,
        tx,
        starts.map(({ subject, startDay }) => ({ subject, day: startDay })),
      );
      const now = new Date();
      const firstSteps = starts.map(({ definition }, index) =>
        startReadySteps(
          definition.steps,
          definition.steps.map(({ key }) => waitingRow(key)),
          assigneeFrom(candidates[index]!),
          now,
        ),
      );
      const runs = await processRepository(tx).insertRuns(
        starts.map((start, index) => newRun(start, firstSteps[index]!.progress, now)),
      );
      const plans = runs.map((run, index) => ({
        run,
        processKey: starts[index]!.process.key,
        subject: starts[index]!.subject,
        startDay: starts[index]!.startDay,
        definition: starts[index]!.definition,
        starts: firstSteps[index]!.starts,
      }));
      const taskIds = await createStepTasks({ tasks, workingCalendars }, tx, plans);
      await processRepository(tx).insertSteps(
        withTaskIds(
          plans,
          firstSteps.map(({ progress }, index) =>
            progress.map((row) => ({ ...row, runId: runs[index]!.id })),
          ),
          taskIds,
        ).flat(),
      );
      return runs;
    },

    async startReadySteps(tx, run, day) {
      const repository = processRepository(tx);
      const definition = definitionOf((await repository.findVersion(run.processVersionId))!);
      const subject = await readSubject(people, tx, run);
      const [candidates] = await readCandidates(people, tx, [{ subject, day }]);
      const now = new Date();
      const next = startReadySteps(definition.steps, run.steps, assigneeFrom(candidates!), now);
      if (next.starts.length === 0) return run;
      const [process] = await repository.findProcessesByIds([run.processId]);
      const plan = {
        run,
        processKey: process!.key,
        subject,
        startDay: run.startDay,
        definition,
        starts: next.starts,
      };
      const startedKeys = new Set(next.starts.map(({ step }) => step.key));
      const [started] = withTaskIds(
        [plan],
        [next.progress.filter(({ stepKey }) => startedKeys.has(stepKey))],
        await createStepTasks({ tasks, workingCalendars }, tx, [plan]),
      );
      await repository.saveStartedSteps(started!);
      return run.withStartedSteps(started!, now);
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

    async stepTitles(tx, run) {
      const version = (await processRepository(tx).findVersion(run.processVersionId))!;
      const { steps } = definitionOf(version);
      const subject = await readSubject(people, tx, run);
      return new Map(steps.map(({ key, task }) => [key, filled(task.title, subject)]));
    },
  };
}

/** The steps starting together in one run, with what their tasks need. */
interface StepsPlan {
  run: ProcessRunFields;
  processKey: string;
  subject: RunSubject | null;
  /** The day due dates count from: the run's start day. */
  startDay: CalendarDate;
  definition: ProcessDefinition;
  starts: StepStart[];
}

/** Each plan's step tasks, created as Broccoli; their ids come back in the order of `plans`. */
async function createStepTasks(
  { tasks, workingCalendars }: { tasks: TaskService; workingCalendars: WorkingCalendarsPort },
  tx: Tx,
  plans: readonly StepsPlan[],
): Promise<string[]> {
  const workingDays = await workingCalendars.readWorkingDays(tx, {
    employeeIds: subjectsCountingBusinessDays(plans),
    days: plans.map(({ startDay }) => startDay),
  });
  const created = await tasks.createTasks(
    PrincipalSecurityContext.system(),
    tx,
    plans.flatMap((plan) => newTasksOf(plan, workingDays.get(plan.subject?.id ?? "") ?? null)),
  );
  return created.map(({ id }) => id);
}

async function readSubject(
  people: PeoplePort,
  tx: Tx,
  { subjectEmployeeId }: ProcessRunFields,
): Promise<RunSubject | null> {
  if (!subjectEmployeeId) return null;
  return (await people.readPeople(tx, [subjectEmployeeId])).get(subjectEmployeeId) ?? null;
}

/** The person each assignee kind names for one run, on the day its steps start. */
type AssigneeCandidates = Readonly<Record<AssigneeRule["kind"], string | null>>;

/** For each run, its subject, its subject's manager on `day` and the owner. */
async function readCandidates(
  people: PeoplePort,
  tx: Tx,
  runs: readonly { subject: RunSubject | null; day: CalendarDate }[],
): Promise<AssigneeCandidates[]> {
  const owner = await people.readOwner(tx);
  const managersByDay = new Map<CalendarDate, Map<string, string>>();
  for (const day of new Set(runs.map((run) => run.day))) {
    const employeeIds = runs.flatMap((run) =>
      run.day === day && run.subject ? [run.subject.id] : [],
    );
    managersByDay.set(day, await people.readManagersOn(tx, { employeeIds, date: day }));
  }
  return runs.map(({ subject, day }) => ({
    subject: subject?.id ?? null,
    subjects_manager: subject ? (managersByDay.get(day)!.get(subject.id) ?? null) : null,
    workspace_owner: owner,
  }));
}

function assigneeFrom(candidates: AssigneeCandidates) {
  return (step: TaskStep) => resolveAssignee(step.task.assignee, candidates);
}

/** The subjects of plans with a step due in business days, which count their own working days. */
function subjectsCountingBusinessDays(plans: readonly StepsPlan[]): string[] {
  const ids = plans.flatMap(({ starts, subject }) =>
    subject && starts.some(({ step }) => step.task.due.unit === "business_days")
      ? [subject.id]
      : [],
  );
  return [...new Set(ids)];
}

function waitingRow(stepKey: string): RunStep {
  return {
    runId: "",
    stepKey,
    status: "step_waiting_to_start",
    taskId: null,
    assigneeNote: null,
    skipReason: null,
    finishedAt: null,
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

/** The tasks of a plan's assigned step starts, due their offset after its start day. */
function newTasksOf(
  { run, processKey, subject, startDay, starts }: StepsPlan,
  isWorkingDay: IsWorkingDay | null,
): NewTask[] {
  return starts.flatMap(({ step, assignee }) =>
    assignee
      ? [
          {
            type: PROCESS_STEP_TO_DO,
            sourceKey: processKey,
            title: filled(step.task.title, subject),
            description:
              step.task.description === null ? null : filled(step.task.description, subject),
            assigneeEmployeeId: assignee.employeeId,
            subjectEmployeeId: subject?.id ?? null,
            record: { recordType: run.recordType, recordId: run.recordId },
            dueDate: addDayOffset(startDay, step.task.due, isWorkingDay),
            cause: { kind: "PROCESS_RUN", ref: run.id },
          },
        ]
      : [],
  );
}

/**
 * Each plan's progress rows, the steps it started given the tasks created for them: `taskIds`
 * follows the plans' assigned starts, in order.
 */
function withTaskIds(
  plans: readonly StepsPlan[],
  progress: readonly (readonly RunStep[])[],
  taskIds: readonly string[],
): RunStep[][] {
  let next = 0;
  return plans.map(({ starts }, index) => {
    const taskIdOf = new Map(
      starts.flatMap(({ step, assignee }) => (assignee ? [[step.key, taskIds[next++]!]] : [])),
    );
    return progress[index]!.map((row) => ({
      ...row,
      taskId: taskIdOf.get(row.stepKey) ?? row.taskId,
    }));
  });
}

/** How far a trigger date can be from its record's date: business days stretch by weekends and holidays. */
function spanOf({ amount, unit }: DayOffset): number {
  return unit === "calendar_days" ? Math.abs(amount) : Math.abs(amount) * 2 + 14;
}

function filled(text: string, subject: Pick<RunSubject, "firstName"> | null): string {
  return text.replaceAll("{firstName}", subject?.firstName ?? "them");
}
