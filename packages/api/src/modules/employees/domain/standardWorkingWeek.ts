import { invalidInput } from "../../../core/applicationError";
import type { WeekdayMinutes } from "./workingPattern";

/** The UK working weeks an owner picks from when turning time off on; the first is Standard's. */
export const STANDARD_WORKING_WEEKS = [
  "monday_to_friday_7_5_hours",
  "monday_to_friday_8_hours",
  "monday_to_friday_7_hours",
  "monday_to_thursday_8_hours",
] as const;
export type StandardWorkingWeek = (typeof STANDARD_WORKING_WEEKS)[number];

/** Each standard week's minutes, full day and the label its working pattern is named with. */
export const STANDARD_WEEKS: Record<
  StandardWorkingWeek,
  { minutes: WeekdayMinutes; fullDayMinutes: number; label: string }
> = {
  monday_to_friday_7_5_hours: weekOf([450, 450, 450, 450, 450], "Mon–Fri, 7.5 hours"),
  monday_to_friday_8_hours: weekOf([480, 480, 480, 480, 480], "Mon–Fri, 8 hours"),
  monday_to_friday_7_hours: weekOf([420, 420, 420, 420, 420], "Mon–Fri, 7 hours"),
  monday_to_thursday_8_hours: weekOf([480, 480, 480, 480, 0], "Mon–Thu, 8 hours"),
};

/** A week sent as `workingWeek`; refuses one that is not standard. */
export function parseStandardWorkingWeek(value: string): StandardWorkingWeek {
  const week = STANDARD_WORKING_WEEKS.find((known) => known === value);
  if (!week) {
    throw invalidInput([{ field: "workingWeek", code: "invalid" }]);
  }
  return week;
}

function weekOf(weekdays: readonly number[], label: string) {
  return {
    minutes: [...weekdays, 0, 0] as unknown as WeekdayMinutes,
    fullDayMinutes: Math.max(...weekdays),
    label,
  };
}
