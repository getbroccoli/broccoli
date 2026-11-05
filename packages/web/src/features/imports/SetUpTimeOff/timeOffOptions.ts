import type {
  BankHolidayCalendar,
  StandardWorkingWeek,
  TimeOffStepQuery,
} from "@/__generated__/graphql";

/** England and Wales first: people without a location start on its terms when there are locations. */
export const NATIONS = [
  "ENGLAND_AND_WALES",
  "SCOTLAND",
  "NORTHERN_IRELAND",
] as const satisfies readonly BankHolidayCalendar[];

/** Each standard week with how many days, from Monday, it works. */
export const WEEKS = [
  { week: "MONDAY_TO_FRIDAY_7_5_HOURS", days: 5 },
  { week: "MONDAY_TO_FRIDAY_8_HOURS", days: 5 },
  { week: "MONDAY_TO_FRIDAY_7_HOURS", days: 5 },
  { week: "MONDAY_TO_THURSDAY_8_HOURS", days: 4 },
] as const satisfies readonly { week: StandardWorkingWeek; days: number }[];

export type Policy = TimeOffStepQuery["timeOffSetup"]["annualLeavePolicies"][number];
