import { addDays, addYears, type CalendarDate, daysBetween, isWithin } from "../../../utils";
import { clashes, datesFrom, type DayPart } from "./bookedDay";
import { leaveYearContaining, type PolicyVersion } from "./timeOffPolicy";

/** Why a booking cannot be made, as the form says it. */
export type BookingRefusalReason =
  | "clashes_with_time_off"
  | "no_working_days"
  | "type_not_offered"
  | "outside_booking_window"
  | "outside_employment"
  | "longer_than_a_year";

/** The first reason a booking cannot be made. */
export interface BookingRefusal {
  reason: BookingRefusalReason;
  date: CalendarDate | null;
  clashingTimeOffId: string | null;
}

const MAX_BOOKING_DAYS = 366;

/**
 * The dates a type may be booked on: from the start of its leave year holding today to the end of
 * the next one; a type without a leave year counts calendar years.
 */
export function bookingWindow({
  leaveYear,
  serviceStart,
  today,
}: {
  leaveYear: PolicyVersion["leaveYear"] | undefined;
  serviceStart: CalendarDate | null;
  today: CalendarDate;
}): { start: CalendarDate; end: CalendarDate } {
  const start = leaveYear
    ? leaveYearContaining(leaveYear, serviceStart, today).start
    : (`${today.slice(0, 4)}-01-01` as CalendarDate);
  return { start, end: addDays(addYears(start, 2), -1) };
}

/** Refuses a booking longer than a year or outside the window, before any day is costed. */
export function refusalOfBounds(
  { startDate, endDate }: { startDate: CalendarDate; endDate: CalendarDate },
  window: { start: CalendarDate; end: CalendarDate },
): BookingRefusal | null {
  if (daysBetween(startDate, endDate) + 1 > MAX_BOOKING_DAYS) {
    return refusal("longer_than_a_year");
  }
  return startDate < window.start || endDate > window.end
    ? refusal("outside_booking_window")
    : null;
}

/** The first date outside the person's employment, then the first the type is not offered on. */
export function refusalOfDates({
  startDate,
  endDate,
  employments,
  isOfferedOn,
}: {
  startDate: CalendarDate;
  endDate: CalendarDate;
  employments: readonly { startDate: CalendarDate | null; endDate: CalendarDate | null }[];
  isOfferedOn: (date: CalendarDate) => boolean;
}): BookingRefusal | null {
  const dates = datesFrom(startDate, endDate);
  const unemployed = dates.find(
    (date) => !employments.some((period) => isWithin(date, period.startDate, period.endDate)),
  );
  if (unemployed) {
    return refusal("outside_employment", unemployed);
  }
  const notOffered = dates.find((date) => !isOfferedOn(date));
  return notOffered ? refusal("type_not_offered", notOffered) : null;
}

/** Nothing to cost, or the first day that clashes with time off already booked. */
export function refusalOfDays(
  charged: readonly { date: CalendarDate; dayPart: DayPart }[],
  booked: readonly { date: CalendarDate; dayPart: DayPart; timeOffId: string }[],
): BookingRefusal | null {
  if (charged.length === 0) {
    return refusal("no_working_days");
  }
  for (const day of charged) {
    const clash = booked.find(
      (other) => other.date === day.date && clashes(other.dayPart, day.dayPart),
    );
    if (clash) {
      return {
        reason: "clashes_with_time_off",
        date: day.date,
        clashingTimeOffId: clash.timeOffId,
      };
    }
  }
  return null;
}

/** What days cost, added up. */
export function totalCost(days: readonly { cost: number }[]): number {
  return days.reduce((sum, { cost }) => sum + cost, 0);
}

function refusal(reason: BookingRefusalReason, date: CalendarDate | null = null): BookingRefusal {
  return { reason, date, clashingTimeOffId: null };
}
