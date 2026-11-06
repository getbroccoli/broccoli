import { asc } from "drizzle-orm";

import type { Orm } from "../../src/core/db";
import type { SetupTermsInput } from "../../src/core/instance";
import { createLogger } from "../../src/core/logger";
import type { Decisions } from "../../src/integrations/ai";
import { terms, workingPatternRepository } from "../../src/modules/employees/db";
import { createTimeOffSetupService } from "../../src/modules/timeOff";
import { parseCalendarDate } from "../../src/utils";
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

/** Terms and their own working pattern have no public setup read yet. */
export async function readTimeOffTerms(orm: Orm) {
  const rows = await orm.select().from(terms).orderBy(asc(terms.name));
  const patterns = await workingPatternRepository(orm).findPatterns();
  return rows.map((row) => ({
    ...row,
    pattern: patterns.find((pattern) => pattern.termsId === row.id) ?? null,
  }));
}

/** Own assignments have no public read separate from the resolved working week. */
export function readOwnPatternAssignments(orm: Orm, employeeIds: string[]) {
  return workingPatternRepository(orm).findAssignments(employeeIds);
}
