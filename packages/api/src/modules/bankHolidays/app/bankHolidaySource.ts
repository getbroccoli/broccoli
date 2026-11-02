import type { CalendarDate } from "../../../utils";
import type { BankHolidayCalendar, BankHolidayDay } from "../domain";
import { GOV_UK_BANK_HOLIDAYS } from "./govUkBankHolidays";

/** Where bank holiday dates come from. */
export interface BankHolidaySource {
  /** Each calendar's bank holidays from `startDate` to `endDate` inclusive, oldest first. */
  getCalendars(
    calendarNames: readonly BankHolidayCalendar[],
    startDate: CalendarDate,
    endDate: CalendarDate,
  ): Promise<Map<BankHolidayCalendar, BankHolidayDay[]>>;
}

/**
 * A source that answers from GOV.UK's dates copied into the code, so it works offline.
 * shortcut: dates end in 2028 and miss bank holidays announced later; replace with a source that
 * fetches the GOV.UK feed when a release can no longer keep up.
 */
export function createStaticBankHolidaySource(): BankHolidaySource {
  return {
    getCalendars(calendarNames, startDate, endDate) {
      return Promise.resolve(
        new Map(
          calendarNames.map((calendarName) => [
            calendarName,
            GOV_UK_BANK_HOLIDAYS[calendarName]
              .filter(([date]) => date >= startDate && date <= endDate)
              .map(([date, name]) => ({ date: date as CalendarDate, name })),
          ]),
        ),
      );
    },
  };
}
