import { ApplicationError, invalidInput } from "../../../core/applicationError";
import { type CalendarDate, parseUuid } from "../../../utils";
import { parseDateField } from "../../employees";
import { bookingWindow, type DayPart, leaveYearContaining } from "../domain";
import type { Person } from "./allowanceEngine";
import type { BookingInput } from "./timeOffBookingService";

const NOTE_MAX_LENGTH = 1_000;

/** A booking's input once its ids and dates are checked. */
export interface ParsedBooking {
  employeeId: string;
  timeOffTypeId: string;
  startDate: CalendarDate;
  endDate: CalendarDate;
  halfDays: ReadonlyMap<CalendarDate, DayPart>;
  note: string | null;
}

/** Refuses ids, dates, a note or half days that are not what a booking takes. */
export function parseBooking(input: BookingInput): ParsedBooking {
  const employeeId = parseUuid(input.employeeId);
  const timeOffTypeId = parseUuid(input.timeOffTypeId);
  if (!employeeId) {
    throw new ApplicationError("NOT_FOUND", "No employee has this id.");
  }
  if (!timeOffTypeId) {
    throw new ApplicationError("NOT_FOUND", "No time off type has this id.");
  }
  const startDate = parseDateField("startDate", input.startDate);
  const endDate = parseDateField("endDate", input.endDate);
  if (endDate < startDate) {
    throw invalidInput([{ field: "endDate", code: "before_start" }]);
  }
  const note = input.note?.trim() || null;
  if (note && note.length > NOTE_MAX_LENGTH) {
    throw invalidInput([{ field: "note", code: "too_long" }]);
  }
  const halfDays = new Map(
    (input.halfDays ?? []).map(
      ({ date, dayPart }) => [parseDateField("halfDays", date), dayPart] as const,
    ),
  );
  return { employeeId, timeOffTypeId, startDate, endDate, halfDays, note };
}

/**
 * The dates a person's type may be booked on: from the start of its leave year holding today to
 * the end of the next one; a type without a leave year counts calendar years.
 */
export function windowOf(
  person: Person,
  timeOffTypeId: string,
  today: CalendarDate,
): { start: CalendarDate; end: CalendarDate } {
  const leaveYear = person.timelineOf(timeOffTypeId).getVersionOnDate(today)?.leaveYear;
  return bookingWindow(
    leaveYear
      ? leaveYearContaining(leaveYear, person.serviceStart, today).start
      : (`${today.slice(0, 4)}-01-01` as CalendarDate),
  );
}
