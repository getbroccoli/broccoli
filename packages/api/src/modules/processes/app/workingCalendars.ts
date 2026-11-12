import { ApplicationError } from "../../../core/applicationError";
import type { Tx } from "../../../core/db";
import { PrincipalSecurityContext } from "../../../core/security";
import { addDays, type CalendarDate } from "../../../utils";
import type { BankHolidayService } from "../../bankHolidays";
import type { EmployeeWorkingPatternService } from "../../employees";
import { type IsWorkingDay, MAX_SEARCH_DAYS, workingDaysOf } from "../domain";

/** People's working days, by their own working weeks and bank holidays, for counting business days. */
export interface WorkingCalendars {
  /**
   * Each person's working days around these days, refusing a year with no bank holidays known;
   * null for a person on no terms, whose offsets count calendar days.
   */
  readWorkingDays(
    tx: Tx,
    input: { employeeIds: readonly string[]; days: readonly CalendarDate[] },
  ): Promise<Map<string, IsWorkingDay | null>>;
}

export function createWorkingCalendars({
  workingPatterns,
  bankHolidays,
}: {
  workingPatterns: EmployeeWorkingPatternService;
  bankHolidays: BankHolidayService;
}): WorkingCalendars {
  return {
    async readWorkingDays(tx, { employeeIds, days }) {
      if (employeeIds.length === 0) return new Map();
      const sorted = [...days].sort();
      const from = addDays(sorted[0]!, -MAX_SEARCH_DAYS);
      const until = addDays(sorted.at(-1)!, MAX_SEARCH_DAYS);
      const weeksByEmployee = await workingPatterns.readWorkingWeeksInTransaction(tx, {
        employeeIds,
        from,
        until,
      });
      const calendarNames = [
        ...new Set(
          [...weeksByEmployee.values()].flatMap((weeks) =>
            weeks.flatMap(({ bankHolidayCalendar: c }) => (c ? [c] : [])),
          ),
        ),
      ];
      const holidays = await bankHolidays.readBankHolidays(PrincipalSecurityContext.system(), {
        calendars: calendarNames,
        from,
        until,
      });
      return new Map(
        employeeIds.map((employeeId) => {
          const weeks = weeksByEmployee.get(employeeId) ?? [];
          return [employeeId, workingDaysOf(weeks, isBankHolidayIn(weeks, holidays))];
        }),
      );
    },
  };
}

function isBankHolidayIn(
  weeks: readonly { bankHolidayCalendar: string | null }[],
  holidays: ReadonlyMap<string, readonly { date: CalendarDate }[]>,
) {
  return (date: CalendarDate, weekIndex: number): boolean => {
    const calendar = weeks[weekIndex]?.bankHolidayCalendar;
    if (!calendar) return false;
    const days = holidays.get(calendar) ?? [];
    const year = date.slice(0, 4);
    // Every UK calendar has bank holidays each year: none means the data ends before it.
    if (!days.some((holiday) => holiday.date.startsWith(year))) {
      throw new ApplicationError("CONFLICT", `No bank holidays are known for ${year}.`);
    }
    return days.some((holiday) => holiday.date === date);
  };
}
