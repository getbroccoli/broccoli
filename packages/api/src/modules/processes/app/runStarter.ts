import { ApplicationError } from "../../../core/applicationError";
import type { Orm, Transact, Tx } from "../../../core/db";
import type { SecurityContext } from "../../../core/security";
import { addDays, type CalendarDate } from "../../../utils";
import type { BankHolidayService } from "../../bankHolidays";
import {
  createEmployeeReadService,
  createEmployeeWorkingPatternService,
  employeeDirectory,
  type EmployeeWorkingPatternService,
} from "../../employees";
import type { TaskService } from "../../tasks";
import { processRepository, type StoredProcess } from "../db";
import {
  addDayOffset,
  type DayOffset,
  type IsWorkingDay,
  parseProcessDefinition,
  type ProcessDefinition,
  type ProcessRun,
  resolveAssignee,
  type RunStep,
  settleRun,
  type StartCause,
  type TaskStep,
  workingDaysOf,
} from "../domain";

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
  subject: RunSubject;
  startCause: StartCause;
  startedByEmployeeId: string | null;
  triggerDate: CalendarDate | null;
  startKey: string | null;
  startDay: CalendarDate;
}

/** Starts runs: their steps' assignees, tasks and due dates. */
export interface RunStarter {
  /** The person with this id, or null when there is none. */
  readSubject(tx: Tx, employeeId: string): Promise<RunSubject | null>;
  /** Creates the run, its steps and their tasks in `tx`; a run whose steps are all skipped finishes at once. */
  start(ctx: SecurityContext, tx: Tx, start: RunStart): Promise<ProcessRun>;
  /** The people whose trigger date is from the later of `turnedOnDay` and `maxDaysLate` days ago, to today. */
  findDue(
    tx: Tx,
    definition: ProcessDefinition,
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
  const calendars: WorkingCalendars = {
    workingPatterns: createEmployeeWorkingPatternService({ transact }),
    bankHolidays,
  };
  const directory = employeeDirectory(orm);

  const readSubject = async (tx: Tx, employeeId: string): Promise<RunSubject | null> => {
    const [employee] = await employees.readEmployeesByName(tx, [employeeId]);
    if (!employee) return null;
    const periods = (await employees.readEmploymentPeriods(tx, [employeeId])).get(employeeId);
    return {
      id: employee.id,
      firstName: employee.firstName,
      startDate: periods?.[0]?.startDate ?? null,
    };
  };

  return {
    readSubject,

    async start(ctx, tx, start) {
      const { definition, subject, startDay } = start;
      const runs = processRepository(tx);
      const run = await runs.insertRun(newRun(start));
      const managers = await employees.readManagerIdsOn(tx, {
        employeeIds: [subject.id],
        date: startDay,
      });
      const candidates = {
        subject: subject.id,
        subjects_manager: managers.get(subject.id) ?? null,
        workspace_owner: await directory.ownersEmployeeId(),
      };
      const needsWorkingDays = definition.steps.some(({ due }) => due.unit === "business_days");
      const isWorkingDay = needsWorkingDays
        ? await workingDaysAround(calendars, ctx, tx, subject.id, startDay)
        : null;
      const steps: RunStep[] = [];
      for (const step of definition.steps) {
        const assignee = resolveAssignee(step.assignee, candidates);
        steps.push(
          assignee
            ? await startStep(tasks, ctx, tx, { run, start, step, assignee, isWorkingDay })
            : skippedStep(run.id, step.key),
        );
      }
      await runs.insertSteps(steps);
      const settled = settleRun(run, steps, new Date());
      return settled === run ? run : runs.saveRun(settled);
    },

    async findDue(tx, { trigger }, { today, turnedOnDay }) {
      const earliest = laterOf(addDays(today, -trigger.maxDaysLate), turnedOnDay);
      if (earliest > today) return [];
      // A start date's trigger date is at most the offset's span away from it.
      const span = spanOf(trigger.offset);
      const starts = await employees.readEmployeesStartingBetween(tx, {
        from: addDays(earliest, -span),
        until: addDays(today, span),
      });
      return [...starts].flatMap(([employeeId, startDate]) => {
        // shortcut: a trigger offset counts calendar days here; count the person's business days when a ready-made process needs them.
        const triggerDate = addDayOffset(startDate, trigger.offset, null);
        return triggerDate >= earliest && triggerDate <= today ? [{ employeeId, triggerDate }] : [];
      });
    },

    async stepTitles(tx, run) {
      const version = (await processRepository(tx).findVersion(run.processVersionId))!;
      const { steps } = parseProcessDefinition(version.schemaVersion, version.definition);
      const subject = run.subjectEmployeeId ? await readSubject(tx, run.subjectEmployeeId) : null;
      return new Map(steps.map(({ key, title }) => [key, filled(title, subject)]));
    },
  };
}

interface WorkingCalendars {
  workingPatterns: EmployeeWorkingPatternService;
  bankHolidays: BankHolidayService;
}

/** Far enough either side of a start day for any offset within its limits, holidays included. */
const SEARCH_DAYS = 400;

function newRun({
  process,
  subject,
  startCause,
  startedByEmployeeId,
  triggerDate,
  startKey,
  startDay,
}: RunStart) {
  return {
    processId: process.id,
    processVersionId: process.activeVersion.id,
    recordType: "employee",
    recordId: subject.id,
    subjectEmployeeId: subject.id,
    startCause,
    startedByEmployeeId,
    triggerDate,
    startKey,
    startDay,
    status: "in_progress" as const,
    finishedAt: null,
    cancelledAt: null,
    cancelledByEmployeeId: null,
    cancelCause: null,
    cancelReason: null,
  };
}

/** Gives the step's task to its assignee, due its offset after the start day. */
async function startStep(
  tasks: TaskService,
  ctx: SecurityContext,
  tx: Tx,
  {
    run,
    start: { process, subject, startDay },
    step,
    assignee,
    isWorkingDay,
  }: {
    run: ProcessRun;
    start: RunStart;
    step: TaskStep;
    assignee: { employeeId: string; note: RunStep["assigneeNote"] };
    isWorkingDay: IsWorkingDay | null;
  },
): Promise<RunStep> {
  const task = await tasks.createTask(ctx, tx, {
    type: "process_step_to_do",
    title: filled(step.title, subject),
    description: step.description === null ? null : filled(step.description, subject),
    assigneeEmployeeId: assignee.employeeId,
    processSource: { processKey: process.key, processRunId: run.id, stepKey: step.key },
    subjectEmployeeId: subject.id,
    record: { recordType: run.recordType, recordId: run.recordId },
    dueDate: addDayOffset(startDay, step.due, isWorkingDay),
    cause: { kind: "PROCESS_RUN", ref: run.id },
  });
  return {
    runId: run.id,
    stepKey: step.key,
    status: "step_awaiting_task_completion",
    taskId: task.id,
    assigneeNote: assignee.note,
    skipReason: null,
    finishedAt: null,
  };
}

/** Business days by the person's own working weeks and bank holidays, refusing a year with none known. */
async function workingDaysAround(
  { workingPatterns, bankHolidays }: WorkingCalendars,
  ctx: SecurityContext,
  tx: Tx,
  employeeId: string,
  day: CalendarDate,
): Promise<IsWorkingDay | null> {
  const from = addDays(day, -SEARCH_DAYS);
  const until = addDays(day, SEARCH_DAYS);
  const weeks =
    (
      await workingPatterns.readWorkingWeeksInTransaction(tx, {
        employeeIds: [employeeId],
        from,
        until,
      })
    ).get(employeeId) ?? [];
  const calendarNames = [...new Set(weeks.flatMap(({ bankHolidayCalendar: c }) => (c ? [c] : [])))];
  const holidays = await bankHolidays.readBankHolidays(ctx, {
    calendars: calendarNames,
    from,
    until,
  });
  return workingDaysOf(weeks, (date, weekIndex) => {
    const calendar = weeks[weekIndex]?.bankHolidayCalendar;
    if (!calendar) return false;
    const days = holidays.get(calendar) ?? [];
    const year = date.slice(0, 4);
    // Every UK calendar has bank holidays each year: none means the data ends before it.
    if (!days.some((holiday) => holiday.date.startsWith(year))) {
      throw new ApplicationError("CONFLICT", `No bank holidays are known for ${year}.`);
    }
    return days.some((holiday) => holiday.date === date);
  });
}

function spanOf({ amount, unit }: DayOffset): number {
  return unit === "calendar_days" ? Math.abs(amount) : Math.abs(amount) * 2 + 14;
}

function laterOf(day: CalendarDate, other: CalendarDate): CalendarDate {
  return other > day ? other : day;
}

function filled(text: string, subject: Pick<RunSubject, "firstName"> | null): string {
  return text.replaceAll("{firstName}", subject?.firstName ?? "them");
}

function skippedStep(runId: string, stepKey: string): RunStep {
  return {
    runId,
    stepKey,
    status: "step_skipped",
    taskId: null,
    assigneeNote: null,
    skipReason: "no_assignee_for_step",
    finishedAt: new Date(),
  };
}
