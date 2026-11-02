import type { SecurityContext } from "../../../core/security";
import type { BankHolidaySource } from "../../../integrations/bankHolidays";
import {
  type BankHolidayCalendar,
  type BankHolidayDay,
  parseBankHolidayCalendar,
  parsePeriodDate,
} from "../domain";

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
      const calendars = input.calendars.map(parseBankHolidayCalendar);
      const from = parsePeriodDate("from", input.from);
      const until = parsePeriodDate("until", input.until);
      const days = await bankHolidaySource.getCalendars(calendars, from, until);
      return new Map(
        calendars.map((calendar) => [
          calendar,
          (days.get(calendar) ?? []).map(({ date, name }) => ({
            date: parsePeriodDate("date", date),
            name,
          })),
        ]),
      );
    },
  };
}
