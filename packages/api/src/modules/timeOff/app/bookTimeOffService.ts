import { ApplicationError, invalidInput } from "../../../core/applicationError";
import type { Transact, Tx } from "../../../core/db";
import type { Logger } from "../../../core/logger";
import type { ModuleDependencies } from "../../../core/moduleManifest";
import type { SecurityContext } from "../../../core/security";
import { type CalendarDate, parseUuid, todayInLondon } from "../../../utils";
import type { BankHolidayService } from "../../bankHolidays";
import {
  createEmployeeReadService,
  createEmployeeWorkingPatternService,
  type EmployeeReadService,
  type EmployeeWorkingPatternService,
} from "../../employees";
import { timeOffPolicyRepository, timeOffRepository } from "../db";
import { type BookingRefusal, bookingWindow, type CostedDay, totalCost } from "../domain";
import { type Person, readPeople } from "./allowanceEngine";
import { checkDays } from "./checkDays";
import { balancesAfter } from "./previewBalances";
import { type ParsedBooking, parseBooking } from "./parseBooking";
import type { TimeOffService } from "./timeOffService";
import type { WhosOutTimeOff } from "./whosOutService";

/** Booking and cancelling a person's time off. */
export interface BookTimeOffService {
  /** What booking would cost and do, without writing anything. Admins only, for now. */
  previewBooking(ctx: SecurityContext, input: BookingInput): Promise<BookingPreview>;
  /** Books approved time off for its working days and runs the allowance engine. Admins only, for now. */
  bookTimeOff(ctx: SecurityContext, input: BookingInput): Promise<BookedTimeOff>;
  /** Cancels a whole booking, giving its days back. Admins only, for now. */
  cancelTimeOff(ctx: SecurityContext, input: { timeOffId: string }): Promise<void>;
}

/** What an admin asks to book: every working day from start to end, some as half days. */
export interface BookingInput {
  employeeId: string;
  timeOffTypeId: string;
  startDate: string;
  endDate: string;
  halfDays?: readonly { date: string; dayPart: "morning" | "afternoon" }[] | null;
  note?: string | null;
}

/** What a booking would cost and do. */
export interface BookingPreview {
  /** Every date from start to end. */
  days: CostedDay[];
  cost: number;
  /** One per leave year touched, oldest first; empty for a type without a balance or when refused. */
  balances: BalanceChange[];
  refusal: BookingRefusal | null;
}

/** A leave year's figures before and after the booking. */
export interface BalanceChange {
  periodStart: CalendarDate;
  periodEnd: CalendarDate;
  balance: "balance_from_allowance" | "unlimited_balance";
  /** Null for an unlimited balance. */
  remainingBefore: number | null;
  remainingAfter: number | null;
  usedBefore: number;
  usedAfter: number;
}

/** A booking as it was saved: only the days that cost something. */
export interface BookedTimeOff extends WhosOutTimeOff {
  employeeId: string;
  timeOffTypeId: string;
  cost: number;
}

export function createBookTimeOffService({
  orm,
  transact,
  logger,
  timeOff,
  bankHolidays,
  today = todayInLondon,
}: Pick<ModuleDependencies, "orm" | "transact" | "logger"> & {
  timeOff: Pick<TimeOffService, "ensureAllowances">;
  bankHolidays: BankHolidayService;
  today?: () => CalendarDate;
}): BookTimeOffService {
  const dependencies: BookingDependencies = {
    transact,
    logger,
    timeOff,
    employeeReads: createEmployeeReadService({ orm }),
    workingWeeks: createEmployeeWorkingPatternService({ transact, logger, today }),
    bankHolidays,
    today,
  };
  return {
    previewBooking: (ctx, input) => previewBooking(dependencies, ctx, input),
    bookTimeOff: (ctx, input) => bookTimeOff(dependencies, ctx, input),
    cancelTimeOff: (ctx, input) => cancelTimeOff(dependencies, ctx, input),
  };
}

interface BookingDependencies {
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
async function previewBooking(
  dependencies: BookingDependencies,
  ctx: SecurityContext,
  input: BookingInput,
): Promise<BookingPreview> {
  const booking = parseBooking(input);
  try {
    return await dependencies.transact(async (tx) => {
      const person = await begin(dependencies, ctx, tx, booking);
      const { days, refusal } = await checkBooking(dependencies, tx, booking, person);
      const cost = totalCost(days);
      if (refusal) {
        return { days, cost, balances: [], refusal };
      }
      const { booked } = await insertAndCost(dependencies, ctx, tx, booking, days);
      const balances = await balancesAfter(tx, person, booking, booked);
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
async function bookTimeOff(
  dependencies: BookingDependencies,
  ctx: SecurityContext,
  input: BookingInput,
): Promise<BookedTimeOff> {
  const booking = parseBooking(input);
  const result = await dependencies.transact(async (tx) => {
    const person = await begin(dependencies, ctx, tx, booking);
    const { days, refusal } = await checkBooking(dependencies, tx, booking, person);
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
async function cancelTimeOff(
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
): Promise<Person> {
  await ctx.requireInScope("time_off", "create", booking.employeeId);
  if (!(await lockPerson(dependencies, tx, booking.employeeId))) {
    throw new ApplicationError("NOT_FOUND", "No employee has this id.");
  }
  const types = await timeOffPolicyRepository(tx).findAllTypes();
  if (!types.some(({ id }) => id === booking.timeOffTypeId)) {
    throw new ApplicationError("NOT_FOUND", "No time off type has this id.");
  }
  const { people } = await readPeople(dependencies.employeeReads, tx, [booking.employeeId]);
  return people[0]!;
}

/** The booking's days and the first refusal, in its window. */
function checkBooking(
  dependencies: BookingDependencies,
  tx: Tx,
  booking: ParsedBooking,
  person: Person,
) {
  const window = windowOf(person, booking.timeOffTypeId, dependencies.today());
  return checkDays(dependencies, tx, { booking, person, window });
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

function windowOf(person: Person, timeOffTypeId: string, today: CalendarDate) {
  return bookingWindow({
    leaveYear: person.timelineOf(timeOffTypeId).getVersionOnDate(today)?.leaveYear,
    serviceStart: person.serviceStart,
    today,
  });
}
