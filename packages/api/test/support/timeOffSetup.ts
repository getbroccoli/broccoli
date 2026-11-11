import { asc } from "drizzle-orm";

import type { Orm } from "../../src/core/db";
import type { SetupTermsInput } from "../../src/core/instance";
import { createLogger } from "../../src/core/logger";
import type { Decisions } from "../../src/integrations/ai";
import { terms, workingPatternRepository } from "../../src/modules/employees/db";
import { createTimeOffSetupService } from "../../src/modules/timeOff";
import { coversDate, parseCalendarDate } from "../../src/utils";
import { bankHolidayService } from "./bankHolidayService";

/** Time off setup with the supplied decision boundary and shipped bank holidays. */
export function timeOffSetupService(orm: Orm, decisions: Decisions) {
  return createTimeOffSetupService({
    decisions,
    logger: createLogger("silent"),
    bankHolidays: bankHolidayService(),
    today: () => parseCalendarDate("2026-06-01")!,
  });
}

/** The setup choice for Glasgow on four days and Leeds on the Standard week. */
export function scotlandTimeOffSetup(): SetupTermsInput {
  return {
    terms: [
      {
        bankHolidayCalendar: "england_and_wales",
        workingWeek: "monday_to_friday_7_5_hours",
        annualLeavePolicyKey: "uk_statutory_minimum",
      },
      {
        bankHolidayCalendar: "scotland",
        workingWeek: "monday_to_thursday_8_hours",
        annualLeavePolicyKey: "uk_25_days_plus_bank_holidays",
      },
    ],
    locationTerms: [
      { locationName: "Glasgow", bankHolidayCalendar: "scotland" },
      { locationName: "Leeds", bankHolidayCalendar: "england_and_wales" },
    ],
  };
}

/** Terms and their currently assigned working pattern. */
export async function readTimeOffTerms(orm: Orm) {
  const rows = await orm.select().from(terms).orderBy(asc(terms.name));
  const repository = workingPatternRepository(orm);
  const patterns = await repository.findPatterns();
  const assignments = await repository.findAssignments({ termsIds: rows.map(({ id }) => id) });
  return rows.map((row) => {
    const assignment = assignments.find(
      (assignment) =>
        "termsId" in assignment.owner &&
        assignment.owner.termsId === row.id &&
        coversDate(assignment, parseCalendarDate("2026-06-01")!),
    );
    return {
      ...row,
      pattern:
        patterns.find((pattern) =>
          pattern.versions.some(({ id }) => id === assignment?.versionId),
        ) ?? null,
    };
  });
}

/** Own assignments have no public read separate from the resolved working week. */
export async function readOwnPatternAssignments(orm: Orm, employeeIds: string[]) {
  const assignments = await workingPatternRepository(orm).findAssignments({ employeeIds });
  return Map.groupBy(assignments, ({ owner }) => {
    if (!("employeeId" in owner)) throw new Error("Expected an employee assignment");
    return owner.employeeId;
  });
}

/** All stored working patterns, including ones without an assignment. */
export function readWorkingPatterns(orm: Orm) {
  return workingPatternRepository(orm).findPatterns();
}
