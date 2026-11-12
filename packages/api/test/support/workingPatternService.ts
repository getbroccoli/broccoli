import type { Orm, Transact } from "../../src/core/db";
import { createLogger } from "../../src/core/logger";
import {
  createEmployeeTermsService,
  createOwnWorkingWeekService,
  createWorkingPatternService,
  createEmployeeWorkingPatternService,
} from "../../src/modules/employees";
import { calendarDate } from "./calendarDate";
import { testTransactor } from "./testTransactor";

/**
 * Every working pattern service on `orm`, with silent logs; pass `transact` to receive their
 * events. `today` is the date changes are checked against, fixed so tests never depend on the clock.
 */
export function workingPatternService(
  orm: Orm,
  {
    transact = testTransactor(orm),
    today = "2026-06-01",
  }: { transact?: Transact; today?: string } = {},
) {
  const dependencies = {
    orm,
    transact,
    logger: createLogger("silent"),
    today: () => calendarDate(today),
  };
  return {
    ...createEmployeeWorkingPatternService(dependencies),
    ...createWorkingPatternService(dependencies),
    ...createEmployeeTermsService(dependencies),
    ...createOwnWorkingWeekService(dependencies),
  };
}
