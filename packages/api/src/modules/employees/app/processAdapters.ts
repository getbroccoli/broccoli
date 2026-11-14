import { ApplicationError } from "../../../core/applicationError";
import type { DomainEvents } from "../../../core/events";
import type { ModuleDependencies } from "../../../core/moduleManifest";
import {
  type IsWorkingDay,
  MAX_SEARCH_DAYS,
  type PeoplePort,
  type WorkingCalendarsPort,
  workingDaysOf,
} from "../../../core/processes";
import { PrincipalSecurityContext } from "../../../core/security";
import { addDays, type CalendarDate } from "../../../utils";
import type { BankHolidayService } from "../../bankHolidays";
import { employmentRepository } from "../db";
import { employeeDirectory } from "./employeeDirectory";
import { readEmployeesByName } from "./employeeReadService";
import { createEmployeeWorkingPatternService } from "./employmentTerms/employeeWorkingPatternService";

/** Processes read people through this: whom a run is about, their managers and the owner. */
export function createPeopleAdapter(): PeoplePort {
  return {
    async readPeople(tx, employeeIds) {
      const found = await readEmployeesByName(tx, employeeIds);
      const startDates = await employmentRepository(tx).findStartDates(found.map(({ id }) => id));
      return new Map(
        found.map(({ id, firstName }) => [
          id,
          { id, firstName, startDate: startDates.get(id) ?? null },
        ]),
      );
    },
    readManagersOn: (tx, { employeeIds, date }) =>
      employmentRepository(tx).findManagerIds(employeeIds, date),
    readOwner: (tx) => employeeDirectory(tx).ownersEmployeeId(),
  };
}

/** Processes count business days through this: people's working weeks and bank holidays. */
export function createWorkingCalendarsAdapter({
  transact,
  bankHolidays,
}: Pick<ModuleDependencies, "transact"> & {
  bankHolidays: BankHolidayService;
}): WorkingCalendarsPort {
  const workingPatterns = createEmployeeWorkingPatternService({ transact });
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
        employeeIds.map((employeeId): [string, IsWorkingDay | null] => {
          const weeks = weeksByEmployee.get(employeeId) ?? [];
          return [employeeId, workingDaysOf(weeks, isBankHolidayIn(weeks, holidays))];
        }),
      );
    },
  };
}

/** Employees' events that may start a process: one run per employee added. */
export const EMPLOYEE_TRIGGERING_EVENTS = {
  "employees.added": {
    recordType: "employee",
    recordIds: ({ employeeIds }: DomainEvents["employees.added"]) => employeeIds,
    payloadFor: (_: DomainEvents["employees.added"], employeeId: string) => ({
      employeeIds: [employeeId],
    }),
  },
};

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
