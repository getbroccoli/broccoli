import type { Orm } from "../../src/core/db";
import { createTermsService } from "../../src/modules/employees";
import { calendarDate } from "./calendarDate";

/** Employment terms as they stand on the supplied date. */
export function termsService(orm: Orm, { today }: { today: string }) {
  return createTermsService({ orm, today: () => calendarDate(today) });
}
