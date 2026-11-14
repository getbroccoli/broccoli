import { createBeforeCommitBus, type Orm, type Transact, transactor } from "../../src/core/db";
import { createEventBus } from "../../src/core/events";
import { createLogger } from "../../src/core/logger";
import {
  createProcessService,
  processesModule,
  TASK_TRIGGERING_EVENTS,
} from "../../src/core/processes";
import { taskRecordType } from "../../src/core/tasks";
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
    transact = testTransactor(orm),
  }: {
    today?: () => CalendarDate;
    transact?: Transact;
  } = {},
) {
  return createProcessService({
    orm,
    transact,
    logger: createLogger("silent"),
    tasks: taskService(orm, { transact }),
    people: createPeopleAdapter(),
    workingCalendars: createWorkingCalendarsAdapter({
      transact,
      bankHolidays: bankHolidayService(),
    }),
    recordTypes: { employee: employeeRecordType(orm), task: taskRecordType(orm) },
    triggeringEvents: collectRegistrations("triggering event", [
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
  { today }: { today: () => CalendarDate },
): Transact {
  const logger = createLogger("silent");
  const beforeCommit = createBeforeCommitBus();
  const transact = transactor(orm, createEventBus(logger), beforeCommit);
  const processes = processService(orm, { today, transact });
  beforeCommit.subscribe(processesModule({ logger, processes }).eventsBeforeCommit!);
  return transact;
}
