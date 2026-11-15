import { ApplicationError } from "../../applicationError";
import type { Transact, Tx } from "../../db";
import type { ModuleDependencies } from "../../moduleManifest";
import type { Connection, PageArgs } from "../../pagination";
import {
  createRecordHistoryReaderService,
  createRecordHistoryService,
  type HistoryLine,
  type RecordTypeRegistry,
} from "../../records";
import { PrincipalSecurityContext, type SecurityContext } from "../../security";
import { type CalendarDate, dateInLondon } from "../../../utils";
import type { TaskService } from "../../tasks";
import { processRepository, type StoredProcess } from "../db";
import { parseProcessDefinition, type TriggeringEvents } from "../domain";
import { createDueRunService } from "./dueRunService";
import { createEventRunService, type EventRunService } from "./eventRunService";
import { processRecordType } from "./processRecordType";
import type { PeoplePort, WorkingCalendarsPort } from "../ports";
import type { Process, ProcessRun, ProcessRunDetails, StepProgress } from "./processViews";
import { createRunLifecycleService, type RunLifecycleService } from "./runLifecycleService";
import { createRunReader, type RunReader } from "./runReader";
import { createRunStarter, type DefinitionReader, type ProcessRecordTypes } from "./runStarter";

/**
 * Processes give people tasks when something happens to a record, and follow each run to its end.
 * Admins turn them on and start runs; a step's assignee finishes it by marking its task done.
 */
export interface ProcessService {
  /** Every process, for those who manage the workspace. */
  listProcesses(ctx: SecurityContext): Promise<Process[]>;
  /** Starts new runs automatically from now on, beginning with today's; already on changes nothing. */
  turnOn(ctx: SecurityContext, processKey: string): Promise<Process>;
  /** Stops new automatic runs; runs in progress keep going. */
  turnOff(ctx: SecurityContext, processKey: string): Promise<Process>;
  /** A process's history, newest first, for those who manage the workspace. */
  readProcessHistory(
    ctx: SecurityContext,
    processKey: string,
    args: PageArgs,
  ): Promise<Connection<HistoryLine>>;
  /** An admin starts the process by hand for one record of its record type, whether it is on or off. */
  startRun(
    ctx: SecurityContext,
    input: { processKey: string; recordId: string },
  ): Promise<ProcessRunDetails>;
  readRun(ctx: SecurityContext, runId: string): Promise<ProcessRunDetails>;
  /** The process's runs the caller may read, newest first. */
  listRuns(ctx: SecurityContext, processKey: string): Promise<ProcessRun[]>;
  /** The run behind a task its assignee or asker reads, as counts. */
  readStepProgress(ctx: SecurityContext, taskId: string): Promise<StepProgress>;
  /**
   * Broccoli's daily pass: starts the runs whose record date has come and cancels runs in
   * progress that can no longer run. One run per transaction, so one failure stops no other.
   */
  startDueRuns(
    ctx: SecurityContext,
    today: CalendarDate,
  ): Promise<{ runsStarted: number; runsCancelled: number }>;
  /**
   * Trusted, for resets: locks every process until the transaction ends, before the tasks, so a
   * reset waits for a run's start instead of deadlocking with it.
   */
  lockProcesses(ctx: SecurityContext, tx: Tx): Promise<void>;
  /** Back to a fresh workspace: deletes every run, turns every process off, forgets their history; the people's deletion took the tasks. */
  resetProcesses(ctx: SecurityContext, tx: Tx): Promise<void>;
  /**
   * Trusted, as the system, before a transaction commits: starts the in-transaction runs its events
   * trigger and queues the after-commit ones, so either commits with the change or not at all.
   */
  startRunsOnEvents: EventRunService["startRunsOnEvents"];
  /** Trusted, as the system, for an after-commit job: starts its runs in their own transaction. */
  startRunsAfterCommit: EventRunService["startRunsAfterCommit"];
  /**
   * The process and step behind each of these tasks that a step created, by task id; the caller
   * shows it only on tasks the person may read.
   */
  readTaskSources(
    taskIds: readonly string[],
  ): Promise<Map<string, { processKey: string; stepKey: string }>>;
  /** Trusted, before the commit: completes the steps of the tasks its events marked done. */
  completeStepsOfDoneTasks: RunLifecycleService["completeStepsOfDoneTasks"];
}

export function createProcessService({
  orm,
  transact,
  jobs,
  logger,
  tasks,
  people,
  workingCalendars,
  recordTypes: registeredRecordTypes,
  triggeringEvents,
  now = () => new Date(),
}: Pick<ModuleDependencies, "orm" | "transact" | "jobs" | "logger"> & {
  tasks: TaskService;
  people: PeoplePort;
  workingCalendars: WorkingCalendarsPort;
  /** Every registered record type; those with process capabilities may be a run's subject. */
  recordTypes: RecordTypeRegistry;
  triggeringEvents: TriggeringEvents;
  /** The clock: when a process is turned on, and from it today in London. */
  now?: () => Date;
}): ProcessService {
  const today = () => dateInLondon(now());
  const recordTypes = processRecordTypesOf(registeredRecordTypes);
  const definitionOf = definitionReader(recordTypes, triggeringEvents);
  const starter = createRunStarter({ tasks, people, workingCalendars, recordTypes, definitionOf });
  const reader = createRunReader({ transact, tasks, starter });
  const lifecycle = createRunLifecycleService({ orm, transact, tasks, starter });
  const dueRuns = createDueRunService({
    orm,
    transact,
    logger,
    tasks,
    starter,
    lifecycle,
    recordTypes,
    definitionOf,
  });
  const eventRuns = createEventRunService({
    transact,
    jobs,
    logger,
    starter,
    today,
    triggeringEvents,
    definitionOf,
  });
  const historyReader = createRecordHistoryReaderService(orm, { process: processRecordType(orm) });

  return {
    async listProcesses(ctx) {
      ctx.require("MANAGE_WORKSPACE");
      return (await processRepository(orm).listProcesses()).map(processView);
    },

    async turnOn(ctx, processKey) {
      const process = await switchProcess({ transact, now, reader }, ctx, processKey, true);
      logger.info({ processKey }, "Process turned on");
      const started = await dueRuns.startDueRuns(PrincipalSecurityContext.system(), today());
      logger.info({ processKey, ...started }, "Due runs checked on turning a process on");
      return process;
    },

    async turnOff(ctx, processKey) {
      const process = await switchProcess({ transact, now, reader }, ctx, processKey, false);
      logger.info({ processKey }, "Process turned off");
      return process;
    },

    async readProcessHistory(ctx, processKey, args) {
      ctx.require("MANAGE_WORKSPACE");
      const process = await reader.requireProcess(orm, processKey);
      return historyReader.readHistory(ctx, "process", process.id, args);
    },

    async startRun(ctx, { processKey, recordId }) {
      const process = await reader.requireProcess(orm, processKey);
      const definition = definitionOf(process.activeVersion);
      const { recordType } = definition.subject;
      const run = await transact(async (tx) => {
        await processRepository(tx).lockProcess(process.id);
        // Keyed by the record's own id, such as an employee's lowercase uuid.
        const [found] = await starter.readRecordSubjects(tx, recordType, [recordId]);
        if (!found) throw recordNotFound();
        const [canonicalId, subject] = found;
        await ctx.requireInScope("process_run", "create", subject?.id ?? "public");
        if (await processRepository(tx).findRunInProgress(process.id, recordType, canonicalId)) {
          throw new ApplicationError(
            "CONFLICT",
            `${process.name} is already running for ${subject?.firstName ?? "this record"}.`,
          );
        }
        const startDay = laterOf(today(), subject?.startDate ?? null);
        const [started] = await starter.startMany(tx, [
          {
            process,
            definition,
            record: { recordType, recordId: canonicalId },
            subject,
            startCause: "started_by_admin",
            startedByEmployeeId: ctx.user?.employeeId ?? null,
            triggerDate: null,
            triggerEvent: null,
            startKey: null,
            startDay,
          },
        ]);
        return started!;
      });
      logger.info({ runId: run.id, processKey, startCause: run.startCause }, "Process run started");
      return reader.readDetails(run);
    },

    async readRun(ctx, runId) {
      const run = await reader.requireRun(orm, runId);
      await ctx.requireInScope("process_run", "read", run.subjectEmployeeId ?? "public");
      return reader.readDetails(run);
    },

    async listRuns(ctx, processKey) {
      const process = await reader.requireProcess(orm, processKey);
      const scope = await ctx.recordScope("process_run", "read");
      const runs = await processRepository(orm).listRuns(process.id, scope);
      return runs.map((run) => reader.view(run, process));
    },

    readStepProgress: (ctx, taskId) => lifecycle.readStepProgress(ctx, taskId),

    startDueRuns: (ctx, day) => dueRuns.startDueRuns(ctx, day),

    async lockProcesses(ctx, tx) {
      ctx.requireSetupAccess("MANAGE_WORKSPACE");
      await processRepository(tx).lockAllProcesses();
    },

    startRunsOnEvents: (ctx, tx, events) => eventRuns.startRunsOnEvents(ctx, tx, events),

    startRunsAfterCommit: (ctx, job) => eventRuns.startRunsAfterCommit(ctx, job),

    completeStepsOfDoneTasks: (tx, events) => lifecycle.completeStepsOfDoneTasks(tx, events),

    readTaskSources: (taskIds) => processRepository(orm).findTaskSources(taskIds),

    async resetProcesses(ctx, tx) {
      ctx.requireSetupAccess("MANAGE_WORKSPACE");
      await processRepository(tx).reset();
      await history.purge(tx, "process");
    },
  };
}

async function switchProcess(
  { transact, now, reader }: { transact: Transact; now: () => Date; reader: RunReader },
  ctx: SecurityContext,
  processKey: string,
  on: boolean,
): Promise<Process> {
  ctx.require("MANAGE_WORKSPACE");
  return transact(async (tx) => {
    const processes = processRepository(tx);
    const process = await reader.requireProcess(tx, processKey);
    await processes.lockProcess(process.id);
    const wasOn = (await reader.requireProcess(tx, processKey)).turnedOnAt !== null;
    if (wasOn !== on) {
      await processes.setTurnedOnAt(process.id, on ? now() : null);
      await history.append(ctx, tx, {
        recordType: "process",
        operation: "UPDATED",
        cause: { kind: "EDITED_DIRECTLY" },
        records: [
          {
            recordId: process.id,
            changes: [{ field: "isOn", oldValue: String(wasOn), newValue: String(on) }],
          },
        ],
      });
    }
    return processView(await reader.requireProcess(tx, processKey));
  });
}

function processView({
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

/** The process capabilities of the record types that registered them, by type. */
function processRecordTypesOf(registry: RecordTypeRegistry): ProcessRecordTypes {
  return Object.fromEntries(
    Object.entries(registry).flatMap(([type, registration]) =>
      registration?.processes ? [[type, registration.processes]] : [],
    ),
  );
}

/** Parses stored definitions against the record types and events the modules registered. */
function definitionReader(
  recordTypes: ProcessRecordTypes,
  triggeringEvents: TriggeringEvents,
): DefinitionReader {
  const catalog = {
    recordTypes: Object.fromEntries(
      Object.entries(recordTypes).map(([type, { dateFields = [] }]) => [type, { dateFields }]),
    ),
    triggeringEvents,
  };
  return ({ schemaVersion, definition }) =>
    parseProcessDefinition(schemaVersion, definition, catalog);
}

function laterOf(day: CalendarDate, other: CalendarDate | null): CalendarDate {
  return other !== null && other > day ? other : day;
}

function recordNotFound(): ApplicationError {
  return new ApplicationError("NOT_FOUND", "No record has this id.");
}

const history = createRecordHistoryService();
