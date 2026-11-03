import Big from "big.js";

import type {
  AllowanceTargetInputs,
  AllowanceTargetLine,
  DatedPolicy,
} from "../../src/modules/timeOff/domain";
import { calendarDate } from "./calendarDate";

/** A full-timer employed all 2026 on the UK statutory policy, England and Wales bank holidays. */
export function allowanceInputs(): AllowanceTargetInputs {
  return {
    leaveYear: { start: calendarDate("2026-01-01"), end: calendarDate("2026-12-31") },
    employments: [{ startDate: null, endDate: null }],
    serviceStart: null,
    policies: [
      {
        effectiveFrom: null,
        effectiveUntil: null,
        balance: "balance_from_allowance",
        bankHolidays: "bank_holidays_included_in_allowance",
        rules: [
          {
            id: "yearly",
            kind: "yearly_entitlement",
            entitlementDays: 28,
            entitlementDaysPerWeek: 5,
            maxDays: 28,
          },
        ],
      },
    ],
    workingWeeks: [
      {
        effectiveFrom: calendarDate("2026-01-01"),
        minutes: [450, 450, 450, 450, 450, 0, 0],
        fullDayMinutes: 450,
        bankHolidayCalendar: "england_and_wales",
      },
    ],
    bankHolidays: new Map([
      [
        "england_and_wales",
        [
          "2026-01-01",
          "2026-04-03",
          "2026-04-06",
          "2026-05-04",
          "2026-05-25",
          "2026-08-31",
          "2026-12-25",
          "2026-12-28",
        ].map(calendarDate),
      ],
      [
        "scotland",
        [
          "2026-01-01",
          "2026-01-02",
          "2026-04-03",
          "2026-05-04",
          "2026-05-25",
          "2026-08-03",
          "2026-11-30",
          "2026-12-25",
          "2026-12-28",
        ].map(calendarDate),
      ],
    ]),
  };
}

/** "25 days plus bank holidays". */
export function onTopPolicy(): DatedPolicy {
  return {
    effectiveFrom: null,
    effectiveUntil: null,
    balance: "balance_from_allowance",
    bankHolidays: "bank_holidays_on_top_of_allowance",
    rules: [
      {
        id: "yearly",
        kind: "yearly_entitlement",
        entitlementDays: 25,
        entitlementDaysPerWeek: 5,
        maxDays: null,
      },
    ],
  };
}

/** Each line as its kind, its rule or bank holiday, and its amount. */
export function targetRowsOf(lines: readonly AllowanceTargetLine[]) {
  return lines.map((line) => [
    line.kind,
    line.allowanceRuleId ?? line.bankHolidayDate,
    line.amount,
  ]);
}

/** What the lines leave to spend: their amounts added up. */
export function balanceOf(lines: readonly AllowanceTargetLine[]): string {
  return lines.reduce((sum, line) => sum.plus(line.amount), Big(0)).toString();
}
