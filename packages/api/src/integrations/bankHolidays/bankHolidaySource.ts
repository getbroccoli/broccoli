import { GOV_UK_BANK_HOLIDAYS } from "./govUkBankHolidays";

/** One bank holiday of a calendar, such as `england_and_wales`. */
export interface SourcedBankHoliday {
  calendar: string;
  /** `YYYY-MM-DD`. */
  date: string;
  name: string;
}

/**
 * Where bank holiday dates come from: the calendars' bank holidays from `from` to `until`
 * inclusive (`YYYY-MM-DD`), by date then calendar. A calendar the source does not know has none.
 */
export type BankHolidaySource = (
  calendars: readonly string[],
  from: string,
  until: string,
) => Promise<SourcedBankHoliday[]>;

/**
 * A source that answers from GOV.UK's dates copied into the code, so it works offline.
 * shortcut: dates end in 2028 and miss bank holidays announced later; replace with a source that
 * fetches the GOV.UK feed when a release can no longer keep up.
 */
export function createStaticBankHolidaySource(): BankHolidaySource {
  return (calendars, from, until) =>
    Promise.resolve(
      calendars
        .flatMap((calendar) =>
          (GOV_UK_BANK_HOLIDAYS[calendar] ?? []).map(([date, name]) => ({ calendar, date, name })),
        )
        .filter(({ date }) => date >= from && date <= until)
        .sort((a, b) => a.date.localeCompare(b.date) || a.calendar.localeCompare(b.calendar)),
    );
}
