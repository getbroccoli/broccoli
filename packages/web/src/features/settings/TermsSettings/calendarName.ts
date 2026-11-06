import type { BankHolidayCalendar } from "@/__generated__/graphql";
import { t } from "@/i18n";

/** A bank holiday calendar's name, such as "England and Wales". */
export function calendarName(calendar: BankHolidayCalendar): string {
  return t(CALENDAR_NAMES[calendar]);
}

const CALENDAR_NAMES = {
  ENGLAND_AND_WALES: "terms.calendar.englandAndWales",
  SCOTLAND: "terms.calendar.scotland",
  NORTHERN_IRELAND: "terms.calendar.northernIreland",
} as const satisfies Record<BankHolidayCalendar, string>;
