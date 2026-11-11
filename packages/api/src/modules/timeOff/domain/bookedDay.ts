import { addDays, type CalendarDate, daysBetween, weekdayOf } from "../../../utils";
import type { BankHolidayCalendar } from "../../bankHolidays";
import type { DatedWorkingWeek } from "./allowanceCalculator";

/** How much of a day a booking takes. */
export type DayPart = "full_day" | "morning" | "afternoon";

/** Why a day of a booking costs what it does. */
export type DayCostReason = "working_day" | "bank_holiday" | "not_a_working_day";

/** One date of a booking with what it costs the person. */
export interface CostedDay {
  date: CalendarDate;
  dayPart: DayPart;
  cost: number;
  reason: DayCostReason;
  bankHolidayName: string | null;
}

/** A bank holiday with its name, as the bank holidays module gives it. */
export interface NamedBankHoliday {
  date: CalendarDate;
  name: string;
}

/** Every working day costs one day of leave, half for a morning or an afternoon. */
export function costOfDay({
  dayPart,
  minutes,
  isBankHoliday,
}: {
  dayPart: DayPart;
  minutes: number;
  isBankHoliday: boolean;
}): number {
  if (minutes === 0 || isBankHoliday) {
    return 0;
  }
  return dayPart === "full_day" ? 1 : 0.5;
}

/** A morning and an afternoon can share a day; any other two parts cannot. */
export function clashes(a: DayPart, b: DayPart): boolean {
  return a === "full_day" || b === "full_day" || a === b;
}

/** Each date from `from` to `until` with what it costs, under the working week of that date. */
export function costedDays({
  from,
  until,
  halfDays,
  workingWeeks,
  bankHolidays,
}: {
  from: CalendarDate;
  until: CalendarDate;
  halfDays: ReadonlyMap<CalendarDate, DayPart>;
  /** Oldest first. */
  workingWeeks: readonly DatedWorkingWeek[];
  bankHolidays: ReadonlyMap<BankHolidayCalendar, readonly NamedBankHoliday[]>;
}): CostedDay[] {
  const holidayOf = (calendar: BankHolidayCalendar, date: CalendarDate) =>
    bankHolidays.get(calendar)?.find((day) => day.date === date);
  return datesFrom(from, until).map((date) => {
    const dayPart = halfDays.get(date) ?? "full_day";
    const { cost, reason, calendar } = costOn({
      date,
      dayPart,
      workingWeeks,
      isBankHoliday: (calendar, day) => holidayOf(calendar, day) !== undefined,
    });
    const bankHolidayName =
      reason === "bank_holiday" && calendar ? holidayOf(calendar, date)!.name : null;
    return { date, dayPart, cost, reason, bankHolidayName };
  });
}

/** What one date costs and why, under the working week in force on it. */
export function costOn({
  date,
  dayPart,
  workingWeeks,
  isBankHoliday,
}: {
  date: CalendarDate;
  dayPart: DayPart;
  /** Oldest first. */
  workingWeeks: readonly DatedWorkingWeek[];
  isBankHoliday: (calendar: BankHolidayCalendar, date: CalendarDate) => boolean;
}): { cost: number; reason: DayCostReason; calendar: BankHolidayCalendar | null } {
  const week = weekOn(workingWeeks, date);
  const minutes = week?.minutes?.[weekdayOf(date)] ?? 0;
  const calendar = week?.bankHolidayCalendar ?? null;
  const holiday = calendar !== null && isBankHoliday(calendar, date);
  return {
    cost: costOfDay({ dayPart, minutes, isBankHoliday: holiday }),
    reason: minutes === 0 ? "not_a_working_day" : holiday ? "bank_holiday" : "working_day",
    calendar,
  };
}

/** Every date from `from` to `until`, both included. */
export function datesFrom(from: CalendarDate, until: CalendarDate): CalendarDate[] {
  return Array.from({ length: daysBetween(from, until) + 1 }, (_, index) => addDays(from, index));
}

/** The working week in force on `date`, if any. */
export function weekOn(
  workingWeeks: readonly DatedWorkingWeek[],
  date: CalendarDate,
): DatedWorkingWeek | undefined {
  return workingWeeks.findLast(({ startDate }) => startDate <= date);
}
