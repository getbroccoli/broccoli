import type { Orm, Transact, Tx } from "../../../core/db";
import { PrincipalSecurityContext } from "../../../core/security";
import { addDays, type CalendarDate } from "../../../utils";
import type { BankHolidayService } from "../../bankHolidays";
import {
  createEmployeeReadService,
  createEmployeeWorkingPatternService,
  employeeDirectory,
  type EmployeeReadService,
} from "../../employees";
import type { NewTask, TaskService } from "../../tasks";
import { type NewRunRow, processRepository, type StoredProcess } from "../db";
import {
  addDayOffset,
  type DayOffset,
  dueTriggerDate,
  type IsWorkingDay,
  parseProcessDefinition,
  type ProcessDefinition,
  type ProcessRun,
  type RecordDateTrigger,
  resolveAssignee,
  type ResolvedAssignee,
  type RunStep,
  type StartCause,
  type TriggerEvent,
} from "../domain";
import { createWorkingCalendars } from "./workingCalendars";

/** The person a run is about, as starting it needs them. */
export interface RunSubject {
  id: string;
  firstName: string;
  /** Their first employment's start. */
  startDate: CalendarDate | null;
}

/** What starting one run needs; the caller holds the process's lock and has checked it may start. */
export interface RunStart {
  process: StoredProcess;
  definition: ProcessDefinition;
  /** The record the run is about. */
  record: { recordType: ProcessDefinition["subject"]["recordType"]; recordId: string };
  /** The person the run is about: the employee, or a task's subject; null for nobody. */
  subject: RunSubject | null;
  startCause: StartCause;
  startedByEmployeeId: string | null;
  triggerDate: CalendarDate | null;
  triggerEvent: TriggerEvent | null;
  startKey: string | null;
  startDay: CalendarDate;
}

/** Starts runs: their steps' assignees, tasks and due dates. */
export interface RunStarter {
  /** The person with this id, or null when there is none. */
  readSubject(tx: Tx, employeeId: string): Promise<RunSubject | null>;
  /** The people among these ids that exist, by id. */
  readSubjects(tx: Tx, employeeIds: readonly string[]): Promise<Map<string, RunSubject>>;
  /**
   * Trusted: creates the runs, their steps and their tasks in `tx`, as Broccoli, with each run as
   * its tasks' cause, in a fixed number of statements; a run whose steps are all skipped is
   * finished at once. Returns the runs in the order of `starts`.
   */
  startMany(tx: Tx, starts: readonly RunStart[]): Promise<ProcessRun[]>;
  /** The people whose start date triggers a run today, with the date it triggered on. */
  findDue(
    tx: Tx,
    trigger: RecordDateTrigger,
    days: { today: CalendarDate; turnedOnDay: CalendarDate },
  ): Promise<{ employeeId: string; triggerDate: CalendarDate }[]>;
  /** Each step's title as its task gets it, in the order the run's version lists the steps. */
  stepTitles(tx: Tx, run: ProcessRun): Promise<Map<string, string>>;
}

export function createRunStarter({
  orm,
  transact,
  tasks,
  bankHolidays,
}: {
  orm: Orm;
  transact: Transact;
  tasks: TaskService;
  bankHolidays: BankHolidayService;
}): RunStarter {
  const employees = createEmployeeReadService({ orm });
  const calendars = createWorkingCalendars({
    workingPatterns: createEmployeeWorkingPatternService({ transact }),
    bankHolidays,
  });
  const readSubjects = (tx: Tx, ids: readonly string[]) => readSubjectsOf(employees, tx, ids);

  return {
    readSubject: async (tx, employeeId) =>
      (await readSubjects(tx, [employeeId])).get(employeeId) ?? null,

    readSubjects,

    async startMany(tx, starts) {
      if (starts.length === 0) return [];
      const assignees = await resolveAssignees(employees, tx, starts);
      const workingDays = await calendars.readWorkingDays(tx, {
        employeeIds: subjectsCountingBusinessDays(starts),
        days: starts.map(({ startDay }) => startDay),
      });
      const now = new Date();
      const runs = await processRepository(tx).insertRuns(
        starts.map((start, index) => newRun(start, assignees[index]!, now)),
      );
      const plans = runs.map((run, index) => ({
        run,
        start: starts[index]!,
        assignees: assignees[index]!,
        isWorkingDay: workingDays.get(starts[index]!.subject?.id ?? "") ?? null,
      }));
      const created = await tasks.createTasks(
        PrincipalSecurityContext.system(),
        tx,
        plans.flatMap(newTasksOf),
      );
      await processRepository(tx).insertSteps(stepsOf(plans, created, now));
      return runs;
    },

    async findDue(tx, trigger, days) {
      // A start date's trigger date is at most the offset's span away from it.
      const span = spanOf(trigger.offset) + trigger.maxDaysLate;
      const starts = await employees.readEmployeesStartingBetween(tx, {
        from: addDays(days.today, -span),
        until: addDays(days.today, span),
      });
      return [...starts].flatMap(([employeeId, startDate]) => {
        const triggerDate = dueTriggerDate(trigger, startDate, days);
        return triggerDate ? [{ employeeId, triggerDate }] : [];
      });
    },

    async stepTitles(tx, run) {
      const version = (await processRepository(tx).findVersion(run.processVersionId))!;
      const { steps } = parseProcessDefinition(version.schemaVersion, version.definition);
      const subject = run.subjectEmployeeId
        ? ((await readSubjects(tx, [run.subjectEmployeeId])).get(run.subjectEmployeeId) ?? null)
        : null;
      return new Map(steps.map(({ key, title }) => [key, filled(title, subject)]));
    },
  };
}

/** One run being started, with what its steps need. */
interface RunPlan {
  run: ProcessRun;
  start: RunStart;
  /** Each step's assignee, in the definition's order; null for a step skipped for want of one. */
  assignees: (ResolvedAssignee | null)[];
  isWorkingDay: IsWorkingDay | null;
}

/** The people among these ids that exist, with their first employment's start, by id. */
async function readSubjectsOf(
  employees: EmployeeReadService,
  tx: Tx,
  employeeIds: readonly string[],
): Promise<Map<string, RunSubject>> {
  if (employeeIds.length === 0) return new Map();
  const found = await employees.readEmployeesByName(tx, employeeIds);
  const periods = await employees.readEmploymentPeriods(
    tx,
    found.map(({ id }) => id),
  );
  return new Map(
    found.map(({ id, firstName }) => [
      id,
      { id, firstName, startDate: periods.get(id)?.[0]?.startDate ?? null },
    ]),
  );
}

/** Each start's step assignees, with each subject's manager on its start day and the owner. */
async function resolveAssignees(
  employees: EmployeeReadService,
  tx: Tx,
  starts: readonly RunStart[],
): Promise<(ResolvedAssignee | null)[][]> {
  const owner = await employeeDirectory(tx).ownersEmployeeId();
  const managersByDay = new Map<CalendarDate, Map<string, string>>();
  for (const day of new Set(starts.map(({ startDay }) => startDay))) {
    const employeeIds = starts.flatMap((start) =>
      start.startDay === day && start.subject ? [start.subject.id] : [],
    );
    managersByDay.set(day, await employees.readManagerIdsOn(tx, { employeeIds, date: day }));
  }
  return starts.map(({ definition, subject, startDay }) => {
    const candidates = {
      subject: subject?.id ?? null,
      subjects_manager: subject ? (managersByDay.get(startDay)!.get(subject.id) ?? null) : null,
      workspace_owner: owner,
    };
    return definition.steps.map((step) => resolveAssignee(step.assignee, candidates));
  });
}

/** The subjects of runs with a step due in business days, which count their own working days. */
function subjectsCountingBusinessDays(starts: readonly RunStart[]): string[] {
  const ids = starts.flatMap(({ definition, subject }) =>
    subject && definition.steps.some(({ due }) => due.unit === "business_days") ? [subject.id] : [],
  );
  return [...new Set(ids)];
}

function newRun(start: RunStart, assignees: readonly (ResolvedAssignee | null)[], now: Date) {
  const finished = assignees.every((assignee) => assignee === null);
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

/** The tasks of a run's assigned steps, due their offset after its start day. */
function newTasksOf({ run, start, assignees, isWorkingDay }: RunPlan): NewTask[] {
  return start.definition.steps.flatMap((step, index) => {
    const assignee = assignees[index];
    if (!assignee) return [];
    return [
      {
        type: "process_step_to_do",
        title: filled(step.title, start.subject),
        description: step.description === null ? null : filled(step.description, start.subject),
        assigneeEmployeeId: assignee.employeeId,
        processSource: { processKey: start.process.key, processRunId: run.id, stepKey: step.key },
        subjectEmployeeId: start.subject?.id ?? null,
        record: { recordType: run.recordType, recordId: run.recordId },
        dueDate: addDayOffset(start.startDay, step.due, isWorkingDay),
        cause: { kind: "PROCESS_RUN", ref: run.id },
      },
    ];
  });
}

/** Every run's steps: awaiting the task created for it, in the same order, or skipped. */
function stepsOf(plans: readonly RunPlan[], created: readonly { id: string }[], now: Date) {
  let next = 0;
  return plans.flatMap(({ run, start, assignees }) =>
    start.definition.steps.map((step, index): RunStep => {
      const assignee = assignees[index];
      return assignee
        ? {
            runId: run.id,
            stepKey: step.key,
            status: "step_awaiting_task_completion",
            taskId: created[next++]!.id,
            assigneeNote: assignee.note,
            skipReason: null,
            finishedAt: null,
          }
        : {
            runId: run.id,
            stepKey: step.key,
            status: "step_skipped",
            taskId: null,
            assigneeNote: null,
            skipReason: "no_assignee_for_step",
            finishedAt: now,
          };
    }),
  );
}

/** How far a trigger date can be from its record's date: business days stretch by weekends and holidays. */
function spanOf({ amount, unit }: DayOffset): number {
  return unit === "calendar_days" ? Math.abs(amount) : Math.abs(amount) * 2 + 14;
}

function filled(text: string, subject: Pick<RunSubject, "firstName"> | null): string {
  return text.replaceAll("{firstName}", subject?.firstName ?? "them");
}
