import { createBeforeCommitBus, type Orm, type Transact, transactor } from "../../src/core/db";
import { createEventBus } from "../../src/core/events";
import { createLogger } from "../../src/core/logger";
import { createProcessService, processesModule } from "../../src/modules/processes";
import { type CalendarDate, todayInLondon } from "../../src/utils";
import { bankHolidayService } from "./bankHolidayService";
import { taskService } from "./services";
import { testTransactor } from "./testTransactor";

/** The process service with real tasks, offline bank holidays and an injectable day, at noon. */
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
    bankHolidays: bankHolidayService(),
    now: () => new Date(`${today()}T12:00:00Z`),
  });
}

/** Transactions whose events start processes before the commit, using the supplied day. */
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
