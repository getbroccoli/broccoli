import type { Orm } from "../../src/core/db";
import { createLogger } from "../../src/core/logger";
import { createProcessService } from "../../src/modules/processes";
import { type CalendarDate, todayInLondon } from "../../src/utils";
import { bankHolidayService } from "./bankHolidayService";
import { taskService } from "./services";
import { testTransactor } from "./testTransactor";

/** The process service with real tasks, offline bank holidays and an injectable day, at noon. */
export function processService(
  orm: Orm,
  { today = todayInLondon }: { today?: () => CalendarDate } = {},
) {
  return createProcessService({
    orm,
    transact: testTransactor(orm),
    logger: createLogger("silent"),
    tasks: taskService(orm),
    bankHolidays: bankHolidayService(),
    now: () => new Date(`${today()}T12:00:00Z`),
  });
}
