import { invalidInput } from "../../../core/applicationError";
import type { Tx } from "../../../core/db";
import { PrincipalSecurityContext } from "../../../core/security";
import type { CalendarDate } from "../../../utils";
import { BANK_HOLIDAY_CALENDARS, type BankHolidayService } from "../../bankHolidays";
import type { EmployeeWorkingPatternService } from "../../employees";
import { timeOffRepository } from "../db";
import {
  type BookingRefusal,
  type CostedDay,
  costedDays,
  refusalOfBounds,
  refusalOfDates,
  refusalOfDays,
} from "../domain";
import type { Person } from "./allowanceEngine";
import type { ParsedBooking } from "./parseBooking";

type Dependencies = {
  workingWeeks: Pick<EmployeeWorkingPatternService, "readWorkingWeeksInTransaction">;
  bankHolidays: BankHolidayService;
};
type Window = { start: CalendarDate; end: CalendarDate };

/**
 * The booking's days and the first refusal, read in `tx`, which must hold the person's lock; bounds
 * first, so an oversized range is refused before any day is costed.
 */
export async function checkDays(
  dependencies: Dependencies,
  tx: Tx,
  { booking, person, window }: { booking: ParsedBooking; person: Person; window: Window },
): Promise<{ days: CostedDay[]; refusal: BookingRefusal | null }> {
  const timeline = person.timelineOf(booking.timeOffTypeId);
  const bounds = refusalOfBounds(booking, window);
  if (bounds) {
    return { days: [], refusal: bounds };
  }
  const days = await costBooking(dependencies, tx, booking);
  const halfDayRefused = [...booking.halfDays.keys()].some(
    (date) => !days.some((day) => day.date === date && day.cost > 0),
  );
  if (halfDayRefused) {
    throw invalidInput([{ field: "halfDays", code: "not_a_working_day" }]);
  }
  const charged = days.filter(({ cost }) => cost > 0);
  const refusal =
    refusalOfDates({
      ...booking,
      employments: person.periods,
      isOfferedOn: (date) => timeline.getVersionOnDate(date) !== null,
    }) ??
    refusalOfDays(
      charged,
      charged.length === 0
        ? []
        : await timeOffRepository(tx).findBookedDays({
            employeeIds: [booking.employeeId],
            from: charged[0]!.date,
            until: charged.at(-1)!.date,
          }),
    );
  return { days, refusal };
}

async function costBooking(
  { workingWeeks, bankHolidays }: Dependencies,
  tx: Tx,
  booking: ParsedBooking,
): Promise<CostedDay[]> {
  const range = { from: booking.startDate, until: booking.endDate };
  const [weeks, holidays] = await Promise.all([
    workingWeeks.readWorkingWeeksInTransaction(tx, {
      employeeIds: [booking.employeeId],
      ...range,
    }),
    bankHolidays.readBankHolidays(PrincipalSecurityContext.system(), {
      calendars: BANK_HOLIDAY_CALENDARS,
      ...range,
    }),
  ]);
  return costedDays({
    ...range,
    halfDays: booking.halfDays,
    workingWeeks: weeks.get(booking.employeeId) ?? [],
    bankHolidays: holidays,
  });
}
