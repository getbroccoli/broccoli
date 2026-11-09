import type { Orm } from "../../src/core/db";
import { createLogger } from "../../src/core/logger";
import { createTermsService } from "../../src/modules/employees";
import { calendarDate } from "./calendarDate";
import { testTransactor } from "./testTransactor";
import { timeOffService } from "./timeOffService";

/** Employment terms as they stand on the supplied date; cloning copies time off rules on it too. */
export function termsService(orm: Orm, { today }: { today: string }) {
  return createTermsService({
    orm,
    transact: testTransactor(orm),
    logger: createLogger("silent"),
    copyTermsParts: timeOffService(orm, { today }).copyTermsPolicies,
    today: () => calendarDate(today),
  });
}
