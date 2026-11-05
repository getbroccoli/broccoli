import { asc } from "drizzle-orm";

import type { Orm } from "../../src/core/db";
import type { SetupTermsInput } from "../../src/core/instance";
import { createLogger } from "../../src/core/logger";
import type { Decisions } from "../../src/integrations/ai";
import { terms, workingPatternRepository } from "../../src/modules/employees/db";
import { createLeaveSetupService } from "../../src/modules/timeOff";
import { parseCalendarDate } from "../../src/utils";
import { bankHolidayService } from "./bankHolidayService";
import { OWNER } from "./testSecurityContext";
import { timeOffService } from "./timeOffService";

/** Leave suggestions with the supplied decision boundary and shipped bank holidays. */
export function leaveSetupService(orm: Orm, decisions: Decisions) {
  return createLeaveSetupService({
    orm,
    decisions,
    logger: createLogger("silent"),
    bankHolidays: bankHolidayService(),
    today: () => parseCalendarDate("2026-06-01")!,
  });
}

/** The setup choice for Glasgow on four days and Leeds on the Standard week. */
export async function scotlandLeaveSetup(orm: Orm): Promise<SetupTermsInput> {
  const policies = await timeOffService(orm).listPolicies(OWNER, orm);
  return {
    terms: [
      {
        bankHolidayCalendar: "england_and_wales",
        workingWeek: "monday_to_friday_7_5_hours",
        annualLeavePolicyId: policies.find(({ key }) => key === "uk_statutory_minimum")!.id,
      },
      {
        bankHolidayCalendar: "scotland",
        workingWeek: "monday_to_thursday_8_hours",
        annualLeavePolicyId: policies.find(({ key }) => key === "uk_25_days_plus_bank_holidays")!
          .id,
      },
    ],
    locationTerms: [
      { locationName: "Glasgow", bankHolidayCalendar: "scotland" },
      { locationName: "Leeds", bankHolidayCalendar: "england_and_wales" },
    ],
  };
}

/** Terms and their dated pattern links have no public setup read yet. */
export async function readLeaveTerms(orm: Orm) {
  const rows = await orm.select().from(terms).orderBy(asc(terms.name));
  const links = await workingPatternRepository(orm).findTermsLinks(rows.map(({ id }) => id));
  return rows.map((row) => ({ ...row, patterns: links.get(row.id) ?? [] }));
}

/** Own assignments have no public read separate from the resolved working week. */
export function readOwnPatternAssignments(orm: Orm, employeeIds: string[]) {
  return workingPatternRepository(orm).findAssignments(employeeIds);
}
