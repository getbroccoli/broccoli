import type { Tx } from "../../db";
import type { Logger } from "../../logger";
import { PrincipalSecurityContext } from "../../security";
import type { CalendarDate } from "../../../utils";
import type { NewTask, TaskService } from "../../tasks";
import { runStepRepository, processRepository } from "../db";
import {
  addDayOffset,
  type AssigneeRule,
  type IsWorkingDay,
  type ProcessDefinition,
  type ProcessRun,
  type ProcessRunFields,
  readyStepKeys,
  resolveAssignee,
  type RunStep,
  startReadySteps,
  type StepStart,
  type TaskStep,
} from "../domain";
import type { PeoplePort, RunSubject, WorkingCalendarsPort } from "../ports";
import type { DefinitionReader } from "./runStarter";

/** A process's own task type: a step's to-do, whose done step processes follows. */
export const PROCESS_STEP_TO_DO = "process_step_to_do";

/** Starts a run's steps: who gets each step's task, the task, and its due date. */
export interface StepStarter {
  /**
   * The first steps of runs about to start: those waiting for nothing, or only for skipped
   * steps, start with assignees found on each run's start day; the others wait.
   */
  planFirstSteps(tx: Tx, runs: readonly FirstStepsInput[]): Promise<FirstSteps[]>;
  /** Trusted: creates the first steps' tasks as Broccoli, and stores every step of the runs. */
  saveFirstSteps(tx: Tx, runs: readonly NewRunSteps[]): Promise<void>;
  /**
   * Trusted, under the run's lock: starts its waiting steps whose listed steps are all done,
   * giving their tasks to whom their rules name on `day`, and saves them. Returns the run with
   * them, finished when nothing is left to do.
   */
  startReadySteps(tx: Tx, run: ProcessRun, day: CalendarDate): Promise<ProcessRun>;
  /** Each step's title as its task gets it, in the order the run's version lists the steps. */
  stepTitles(tx: Tx, run: ProcessRunFields): Promise<Map<string, string>>;
}

/** What a new run's first steps need, before the run is stored. */
export interface FirstStepsInput {
  definition: ProcessDefinition;
  subject: RunSubject | null;
  /** The day its first steps' assignees are found on, and its due dates count from. */
  startDay: CalendarDate;
}

/** A new run's steps as they start: those started, and the progress of every step. */
export interface FirstSteps {
  starts: StepStart[];
  progress: RunStep[];
}

/** A stored new run with its first steps, to save. */
export interface NewRunSteps extends FirstStepsInput {
  run: ProcessRunFields;
  processKey: string;
  first: FirstSteps;
}

/** What starting steps reads and writes through. */
export interface StepStarterDependencies {
  tasks: TaskService;
  people: PeoplePort;
  workingCalendars: WorkingCalendarsPort;
  definitionOf: DefinitionReader;
  logger: Logger;
}

export function createStepStarter(dependencies: StepStarterDependencies): StepStarter {
  const { tasks, people, workingCalendars, definitionOf, logger } = dependencies;
  const taskMaker = { tasks, workingCalendars };
  return {
    async planFirstSteps(tx, runs) {
      const candidates = await readCandidates(
        people,
        tx,
        runs.map(({ subject, startDay }) => ({ subject, day: startDay })),
      );
      const now = new Date();
      return runs.map(({ definition }, index) =>
        startReadySteps(
          definition.steps,
          definition.steps.map(({ key }) => waitingRow(key)),
          assigneeFrom(candidates[index]!),
          now,
        ),
      );
    },

    async saveFirstSteps(tx, runs) {
      const plans = runs.map(({ first, ...run }) => ({ ...run, starts: first.starts }));
      const taskIds = await createStepTasks(taskMaker, tx, plans);
      const progress = runs.map(({ run, first }) =>
        first.progress.map((row) => ({ ...row, runId: run.id })),
      );
      await runStepRepository(tx).insertSteps(withTaskIds(plans, progress, taskIds).flat());
    },

    async startReadySteps(tx, run, day) {
      try {
        return await startReadyStepsOf(dependencies, tx, run, day);
      } catch (error) {
        const kind = (error as Error | undefined)?.constructor?.name;
        logger.error(
          { runId: run.id, kind },
          "Process steps not started, so the mark done rolls back",
        );
        throw error;
      }
    },

    async stepTitles(tx, run) {
      const version = (await processRepository(tx).findVersion(run.processVersionId))!;
      const { steps } = definitionOf(version);
      const subject = await readSubject(people, tx, run);
      return new Map(steps.map(({ key, task }) => [key, filled(task.title, subject)]));
    },
  };
}

/** Starts the run's ready steps with their tasks, and saves them; the run as it was when none is ready. */
async function startReadyStepsOf(
  { tasks, people, workingCalendars, definitionOf }: StepStarterDependencies,
  tx: Tx,
  run: ProcessRun,
  day: CalendarDate,
): Promise<ProcessRun> {
  if (!run.steps.some(({ status }) => status === "step_waiting_to_start")) return run;
  const processes = processRepository(tx);
  const definition = definitionOf((await processes.findVersion(run.processVersionId))!);
  if (readyStepKeys(definition.steps, run.steps).length === 0) return run;
  const subject = await readSubject(people, tx, run);
  const [candidates] = await readCandidates(people, tx, [{ subject, day }]);
  const now = new Date();
  const next = startReadySteps(definition.steps, run.steps, assigneeFrom(candidates!), now);
  const [process] = await processes.findProcessesByIds([run.processId]);
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
  await runStepRepository(tx).saveStartedSteps(started!);
  return run.withStartedSteps(started!, now);
}

/** The steps starting together in one run, with what their tasks need. */
interface StepsPlan extends FirstStepsInput {
  run: ProcessRunFields;
  processKey: string;
  starts: StepStart[];
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

async function readSubject(
  people: PeoplePort,
  tx: Tx,
  { subjectEmployeeId }: ProcessRunFields,
): Promise<RunSubject | null> {
  if (!subjectEmployeeId) return null;
  return (await people.readPeople(tx, [subjectEmployeeId])).get(subjectEmployeeId) ?? null;
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

/** The subjects of plans with a step due in business days, which count their own working days. */
function subjectsCountingBusinessDays(plans: readonly StepsPlan[]): string[] {
  const ids = plans.flatMap(({ starts, subject }) =>
    subject && starts.some(({ step }) => step.task.due.unit === "business_days")
      ? [subject.id]
      : [],
  );
  return [...new Set(ids)];
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

function filled(text: string, subject: Pick<RunSubject, "firstName"> | null): string {
  return text.replaceAll("{firstName}", subject?.firstName ?? "them");
}
