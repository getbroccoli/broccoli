import type { CalendarDate } from "../../../utils";
import type { DayPart } from "../domain";
import { timeOff } from "./timeOffTable";
import { timeOffDays } from "./timeOffDaysTable";

/** The columns of a time off row that every read of it returns. */
export const TIME_OFF_COLUMNS = {
  id: timeOff.id,
  employeeId: timeOff.employeeId,
  timeOffTypeId: timeOff.timeOffTypeId,
  status: timeOff.status,
  note: timeOff.note,
  createdAt: timeOff.createdAt,
};

/** A day's columns, selected beside its time off's. */
export const DAY_COLUMNS = { date: timeOffDays.date, dayPart: timeOffDays.dayPart };

/** Rows of time off joined with one day each, in their order, as one time off each with its days. */
export function groupDays<TimeOff extends { id: string }>(
  rows: readonly { timeOff: TimeOff; day: { date: CalendarDate; dayPart: DayPart } }[],
): (TimeOff & { days: { date: CalendarDate; dayPart: DayPart }[] })[] {
  return [...Map.groupBy(rows, (row) => row.timeOff.id).values()].map((days) => ({
    ...days[0]!.timeOff,
    days: days.map(({ day }) => day),
  }));
}
