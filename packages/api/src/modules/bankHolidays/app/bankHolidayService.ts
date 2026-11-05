import type { SecurityContext } from "../../../core/security";
import {
  type BankHolidayCalendar,
  type BankHolidayDay,
  parseBankHolidayCalendar,
  parsePeriodDate,
} from "../domain";
import type { BankHolidaySource } from "./bankHolidaySource";

/** Each nation's bank holidays, for the modules that cost leave. Dates are public facts. */
export interface BankHolidayService {
  /**
   * Each calendar's bank holidays from `from` to `until` inclusive, oldest first. Any signed-in
   * caller or Broccoli itself may read them.
   */
  readBankHolidays: (
    ctx: SecurityContext,
    input: { calendars: readonly BankHolidayCalendar[]; from: string; until: string },
  ) => Promise<Map<BankHolidayCalendar, BankHolidayDay[]>>;
}

export function createBankHolidayService({
  bankHolidaySource,
}: {
  bankHolidaySource: BankHolidaySource;
}): BankHolidayService {
  return {
    async readBankHolidays(ctx, input) {
      if (!ctx.user) {
        ctx.requireSystem();
      }
      const calendars = input.calendars.map((calendar) => parseBankHolidayCalendar(calendar));
      const from = parsePeriodDate("from", input.from);
      const until = parsePeriodDate("until", input.until);
      return await bankHolidaySource.getCalendars(calendars, from, until);
    },
  };
}
