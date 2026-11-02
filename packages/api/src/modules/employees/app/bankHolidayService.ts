import type { BankHolidaySource } from "../../../integrations/bankHolidays";
import type { SecurityContext } from "../../../core/security";
import {
  type BankHoliday,
  type BankHolidayCalendar,
  parseBankHolidayCalendar,
  parseDateField,
} from "../domain";

/** Each nation's bank holidays, for the modules that cost leave. Dates are public facts. */
export interface BankHolidayService {
  /**
   * The calendars' bank holidays from `from` to `until` inclusive, by date then calendar. Any
   * signed-in caller or Broccoli itself may read them.
   */
  readBankHolidays: (
    ctx: SecurityContext,
    input: { calendars: readonly BankHolidayCalendar[]; from: string; until: string },
  ) => Promise<BankHoliday[]>;
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
      const calendars = input.calendars.map(parseBankHolidayCalendar);
      const from = parseDateField("from", input.from);
      const until = parseDateField("until", input.until);
      const holidays = await bankHolidaySource(calendars, from, until);
      return holidays.map(({ calendar, date, name }) => ({
        calendar: parseBankHolidayCalendar(calendar),
        date: parseDateField("date", date),
        name,
      }));
    },
  };
}
