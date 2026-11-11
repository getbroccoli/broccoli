import type { Orm } from "../../src/core/db";
import type { BankHolidayCalendar } from "../../src/modules/bankHolidays";
import { workingPatternRepository } from "../../src/modules/employees/db";
import type { WeekdayMinutes } from "../../src/modules/employees";
import { calendarDate } from "./calendarDate";

/** A published working week without an assignment. */
export async function seedWorkingPattern(
  orm: Orm,
  input: {
    name?: string;
    minutes?: WeekdayMinutes;
    bankHolidayCalendar?: BankHolidayCalendar;
  } = {},
) {
  const repository = workingPatternRepository(orm);
  const id = await repository.insertPattern(input.name ?? null);
  const versionId = await repository.insertVersion(id, {
    minutes: input.minutes ?? [450, 450, 450, 450, 450, 0, 0],
    bankHolidayCalendar: input.bankHolidayCalendar ?? "england_and_wales",
    status: "published",
  });
  return { id, versionId };
}

/** A new published working week assigned to these terms for the given dates. */
export async function seedTermsWeek(
  orm: Orm,
  input: {
    termsId: string;
    minutes?: WeekdayMinutes;
    bankHolidayCalendar?: BankHolidayCalendar;
    startDate: string;
    endDate?: string | null;
  },
) {
  const { id: workingPatternId, versionId } = await seedWorkingPattern(orm, input);
  const assignmentId = await workingPatternRepository(orm).insertAssignment({
    owner: { termsId: input.termsId },
    versionId,
    startDate: calendarDate(input.startDate),
    endDate: input.endDate ? calendarDate(input.endDate) : null,
  });
  return { workingPatternId, versionId, assignmentId };
}

/** A person's own assignment of an existing published working week. */
export function seedOwnWeek(
  orm: Orm,
  input: { employeeId: string; versionId: string; startDate: string; endDate?: string | null },
) {
  return workingPatternRepository(orm).insertAssignment({
    owner: { employeeId: input.employeeId },
    versionId: input.versionId,
    startDate: calendarDate(input.startDate),
    endDate: input.endDate ? calendarDate(input.endDate) : null,
  });
}
