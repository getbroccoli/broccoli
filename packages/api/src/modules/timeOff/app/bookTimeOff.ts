import { ApplicationError, invalidInput } from "../../../core/applicationError";
import type { Tx } from "../../../core/db";
import type { Logger } from "../../../core/logger";
import { PrincipalSecurityContext, type SecurityContext } from "../../../core/security";
import { type CalendarDate, parseUuid } from "../../../utils";
import { BANK_HOLIDAY_CALENDARS, type BankHolidayService } from "../../bankHolidays";
import type { EmployeeReadService, EmployeeWorkingPatternService } from "../../employees";
import { timeOffPolicyRepository, timeOffRepository } from "../db";
import {
  type BookingRefusal,
  type CostedDay,
  costedDays,
  refusalOfBounds,
  refusalOfDates,
  refusalOfDays,
  totalCost,
} from "../domain";
import { readPeople } from "./allowanceEngine";
import { balancesAfter } from "./previewBalances";
import { type ParsedBooking, parseBooking, windowOf } from "./parseBooking";
import type { BookedTimeOff, BookingInput, BookingPreview } from "./timeOffBookingService";
import type { TimeOffService } from "./timeOffService";
import type { Transact } from "../../../core/db";

/** What booking and cancelling need. */
export interface BookingDependencies {
  transact: Transact;
  logger: Logger;
  timeOff: Pick<TimeOffService, "ensureAllowances">;
  employeeReads: Pick<
    EmployeeReadService,
    "lockEmployees" | "readEmploymentPeriods" | "readTermsMemberships"
  >;
  workingWeeks: Pick<EmployeeWorkingPatternService, "readWorkingWeeksInTransaction">;
  bankHolidays: BankHolidayService;
  today: () => CalendarDate;
}

/** What booking would cost and do: the booking is made and the engine run, then rolled back. */
export async function previewBooking(
  dependencies: BookingDependencies,
  ctx: SecurityContext,
  input: BookingInput,
): Promise<BookingPreview> {
  const booking = parseBooking(input);
  try {
    return await dependencies.transact(async (tx) => {
      await begin(dependencies, ctx, tx, booking);
      const { days, refusal } = await check(dependencies, tx, booking);
      const cost = totalCost(days);
      if (refusal) {
        return { days, cost, balances: [], refusal };
      }
      const { booked } = await insertAndCost(dependencies, ctx, tx, booking, days);
      const { people } = await readPeople(dependencies.employeeReads, tx, [booking.employeeId]);
      const balances = await balancesAfter(tx, people[0]!, booking, booked);
      throw new PreviewDone({ days, cost, balances, refusal: null });
    });
  } catch (error) {
    if (error instanceof PreviewDone) {
      return error.preview;
    }
    throw error;
  }
}

/** Books approved time off for its working days and runs the engine for the person. */
export async function bookTimeOff(
  dependencies: BookingDependencies,
  ctx: SecurityContext,
  input: BookingInput,
): Promise<BookedTimeOff> {
  const booking = parseBooking(input);
  const result = await dependencies.transact(async (tx) => {
    await begin(dependencies, ctx, tx, booking);
    const { days, refusal } = await check(dependencies, tx, booking);
    if (refusal) {
      throw invalidInput([{ field: "dates", code: refusal.reason }]);
    }
    return await insertAndCost(dependencies, ctx, tx, booking, days);
  });
  const cost = totalCost(result.booked);
  dependencies.logger.info(
    {
      timeOffId: result.id,
      employeeId: booking.employeeId,
      timeOffTypeId: booking.timeOffTypeId,
      dayCount: result.booked.length,
      cost,
      ...result.ensured,
    },
    "Booked time off",
  );
  return {
    id: result.id,
    employeeId: booking.employeeId,
    timeOffTypeId: booking.timeOffTypeId,
    days: result.booked.map(({ date, dayPart }) => ({ date, dayPart })),
    cost,
    note: booking.note,
    bookedAt: result.createdAt,
  };
}

/** Cancels a whole booking and runs the engine, giving its days back. */
export async function cancelTimeOff(
  dependencies: BookingDependencies,
  ctx: SecurityContext,
  input: { timeOffId: string },
): Promise<void> {
  const { transact, timeOff, logger, employeeReads, today } = dependencies;
  const timeOffId = parseUuid(input.timeOffId);
  const result = await transact(async (tx) => {
    const repository = timeOffRepository(tx);
    const owner = timeOffId ? await repository.findEmployeeId(timeOffId) : null;
    if (!owner) {
      throw new ApplicationError("NOT_FOUND", "No time off has this id.");
    }
    await ctx.requireInScope("time_off", "delete", owner);
    // The person before their booking, as deleting the person takes them with its cascade.
    const locked = await lockPerson(dependencies, tx, owner);
    const found = locked ? await repository.lockTimeOff(timeOffId!) : null;
    if (!found) {
      throw new ApplicationError("NOT_FOUND", "No time off has this id.");
    }
    if (found.status === "cancelled") {
      throw new ApplicationError("CONFLICT", "This booking is already cancelled.");
    }
    // A closed leave year is never recalculated, so its days could not go back.
    const { people } = await readPeople(employeeReads, tx, [found.employeeId]);
    if (found.firstDate < windowOf(people[0]!, found.timeOffTypeId, today()).start) {
      throw new ApplicationError("CONFLICT", "This booking is in a leave year that has closed.");
    }
    await repository.cancel(timeOffId!);
    const ensured = await timeOff.ensureAllowances(ctx, tx, {
      employeeIds: [found.employeeId],
      cause: { kind: "TIME_OFF_CANCELLED", ref: timeOffId },
    });
    return { ...found, ensured };
  });
  logger.info(
    {
      timeOffId,
      employeeId: result.employeeId,
      timeOffTypeId: result.timeOffTypeId,
      ...result.ensured,
    },
    "Cancelled time off",
  );
}

/** Thrown to roll a preview's writes back, carrying what it found. */
class PreviewDone extends Error {
  constructor(readonly preview: BookingPreview) {
    super("Preview done");
  }
}

/** Locks the person and checks the type exists; refuses an unknown person or type. */
async function begin(
  dependencies: BookingDependencies,
  ctx: SecurityContext,
  tx: Tx,
  booking: ParsedBooking,
) {
  await ctx.requireInScope("time_off", "create", booking.employeeId);
  if (!(await lockPerson(dependencies, tx, booking.employeeId))) {
    throw new ApplicationError("NOT_FOUND", "No employee has this id.");
  }
  const types = await timeOffPolicyRepository(tx).findAllTypes();
  const type = types.find(({ id }) => id === booking.timeOffTypeId);
  if (!type) {
    throw new ApplicationError("NOT_FOUND", "No time off type has this id.");
  }
  return type;
}

/**
 * Locks what a booking reads in the order everyone takes it: policies, then working patterns (as
 * assigning a pattern takes them before the person's row), then the person. False when the person
 * is gone.
 */
async function lockPerson(
  { employeeReads, workingWeeks, today }: BookingDependencies,
  tx: Tx,
  employeeId: string,
): Promise<boolean> {
  await timeOffPolicyRepository(tx).sharePolicies();
  // A one-day read only to take the working patterns' read lock before the person's.
  await workingWeeks.readWorkingWeeksInTransaction(tx, {
    employeeIds: [employeeId],
    from: today(),
    until: today(),
  });
  const [locked] = await employeeReads.lockEmployees(tx, [employeeId]);
  return locked !== undefined;
}

/** The booking's days and the first refusal, read in `tx`, which must hold the person's lock. */
async function check(
  dependencies: BookingDependencies,
  tx: Tx,
  booking: ParsedBooking,
): Promise<{ days: CostedDay[]; refusal: BookingRefusal | null }> {
  const { people } = await readPeople(dependencies.employeeReads, tx, [booking.employeeId]);
  const person = people[0]!;
  const timeline = person.timelineOf(booking.timeOffTypeId);
  // Bounds first, so an oversized range is refused before any day is costed.
  const bounds = refusalOfBounds(
    booking,
    windowOf(person, booking.timeOffTypeId, dependencies.today()),
  );
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
  { workingWeeks, bankHolidays }: BookingDependencies,
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

async function insertAndCost(
  { timeOff }: BookingDependencies,
  ctx: SecurityContext,
  tx: Tx,
  booking: ParsedBooking,
  days: CostedDay[],
) {
  const booked = days.filter(({ cost }) => cost > 0);
  const saved = await timeOffRepository(tx).insertBooking({
    employeeId: booking.employeeId,
    timeOffTypeId: booking.timeOffTypeId,
    note: booking.note,
    createdByUserId: ctx.user?.userId ?? null,
    days: booked.map(({ date, dayPart }) => ({ date, dayPart })),
  });
  const ensured = await timeOff.ensureAllowances(ctx, tx, {
    employeeIds: [booking.employeeId],
    cause: { kind: "TIME_OFF_BOOKED", ref: saved.id },
  });
  return { ...saved, booked, ensured };
}
