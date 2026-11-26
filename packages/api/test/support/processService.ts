import {
  APPROVAL_TRIGGERING_EVENTS,
  approvalsModule,
  createApprovalService,
} from "../../src/core/approvals";
import {
  type BeforeCommitHandler,
  createBeforeCommitBus,
  type Orm,
  type Transact,
  transactor,
} from "../../src/core/db";
import { createEventBus } from "../../src/core/events";
import type { JobQueue, Jobs } from "../../src/core/jobs";
import { createLogger } from "../../src/core/logger";
import {
  createProcessService,
  processesModule,
  type ProcessActionRegistrations,
  type TriggeringEventRegistration,
} from "../../src/core/processes";
import type { RecordTypeRegistry } from "../../src/core/records";
import { TASK_TRIGGERING_EVENTS, taskRecordType } from "../../src/core/tasks";
import {
  createPeopleAdapter,
  createWorkingCalendarsAdapter,
  EMPLOYEE_TRIGGERING_EVENTS,
  employeeRecordType,
} from "../../src/modules/employees";
import { type CalendarDate, collectRegistrations, todayInLondon } from "../../src/utils";
import { bankHolidayService } from "./bankHolidayService";
import { taskService } from "./services";
import { testTransactor } from "./testTransactor";

/**
 * The process service with real tasks, people, record types and triggering events, offline bank
 * holidays and an injectable day, at noon.
 */
export function processService(
  orm: Orm,
  {
    today = todayInLondon,
    actions = {},
    recordTypes = {},
    transact = testTransactor(orm),
    jobs = { send: () => Promise.reject(new Error("Unexpected job")) },
  }: {
    today?: () => CalendarDate;
    actions?: ProcessActionRegistrations;
    recordTypes?: RecordTypeRegistry;
    transact?: Transact;
    jobs?: JobQueue;
  } = {},
) {
  return createProcessService({
    orm,
    actions,
    transact,
    jobs,
    logger: createLogger("silent"),
    tasks: taskService(orm, { transact }),
    people: createPeopleAdapter({ orm }),
    workingCalendars: createWorkingCalendarsAdapter({
      transact,
      bankHolidays: bankHolidayService(),
    }),
    recordTypes: {
      employee: employeeRecordType(orm),
      task: taskRecordType(orm),
      ...recordTypes,
    },
    triggeringEvents: collectRegistrations<TriggeringEventRegistration>("triggering event", [
      APPROVAL_TRIGGERING_EVENTS,
      EMPLOYEE_TRIGGERING_EVENTS,
      TASK_TRIGGERING_EVENTS,
    ]),
    now: () => new Date(`${today()}T12:00:00Z`),
  });
}

/**
 * Transactions whose events move processes on before the commit, as in the server: a done step's
 * run, and the runs events start, on the supplied day.
 */
export function transactWithProcesses(
  orm: Orm,
  {
    today,
    jobs,
    actions = {},
    recordTypes,
  }: {
    today: () => CalendarDate;
    jobs?: JobQueue;
    actions?: ProcessActionRegistrations;
    recordTypes?: RecordTypeRegistry;
  },
  ...handlers: BeforeCommitHandler[]
): Transact {
  const logger = createLogger("silent");
  const beforeCommit = createBeforeCommitBus();
  const transact = transactor(orm, createEventBus(logger), beforeCommit);
  const processes = processService(orm, { today, transact, jobs, actions, recordTypes });
  beforeCommit.subscribe(processesModule({ logger, processes }).eventsBeforeCommit!);
  for (const handler of handlers) beforeCommit.subscribe(handler);
  return transact;
}

/** Delivers approval events before commit, including to the feature that requested the approval. */
export function transactWithApprovals(
  orm: Orm,
  options: { today: () => CalendarDate; recordTypes?: RecordTypeRegistry },
  ...handlers: BeforeCommitHandler[]
): Transact {
  const approvals = approvalsModule({
    logger: createLogger("silent"),
    approvals: approvalService(orm),
  });
  return transactWithProcesses(orm, options, approvals.eventsBeforeCommit!, ...handlers);
}

/** The approval service on `orm`, withdrawing approvals through the process service built with these options. */
export function approvalService(orm: Orm, options: Parameters<typeof processService>[1] = {}) {
  return createApprovalService({ processes: processService(orm, options) });
}

/** Collects after-commit jobs and delivers them through the real handler and before-commit bus. */
export function afterCommitProcesses(
  orm: Orm,
  { today, actions = {} }: { today: () => CalendarDate; actions?: ProcessActionRegistrations },
) {
  const queuedJobs: Jobs["processes.startRunsAfterCommit"][] = [];
  const jobs: JobQueue = {
    send: (_tx, name, payload) => {
      if (name !== "processes.startRunsAfterCommit") {
        return Promise.reject(new Error("Unexpected job"));
      }
      queuedJobs.push(payload as Jobs["processes.startRunsAfterCommit"]);
      return Promise.resolve();
    },
  };
  const transact = transactWithProcesses(orm, { today, jobs, actions });
  const processes = processService(orm, { today, transact, jobs, actions });
  const module = processesModule({ logger: createLogger("silent"), processes });
  return {
    transact,
    queuedJobs,
    runJob: (payload: Jobs["processes.startRunsAfterCommit"]) =>
      module.jobs!["processes.startRunsAfterCommit"]!.run(payload),
  };
}
