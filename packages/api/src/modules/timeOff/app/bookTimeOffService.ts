import { ApplicationError, invalidInput } from "../../../core/applicationError";
import type { Tx } from "../../../core/db";
import { createWriteModeService } from "../../../core/records";
import type { ModuleDependencies } from "../../../core/moduleManifest";
import type { SecurityContext } from "../../../core/security";
import { type CalendarDate, parseUuid, todayInLondon } from "../../../utils";
import type { BankHolidayService } from "../../bankHolidays";
import { timeOffRepository, timeOffRequestRepository, type TimeOffStatus } from "../db";
import { type BookingRefusal, type CostedDay, totalCost } from "../domain";
import { readPeople } from "./allowanceEngine";
import {
  appendStatusChange,
  begin,
  type BookingDependencies,
  bookingDependencies,
  checkBooking,
  lockPerson,
  saveTimeOff,
  windowOf,
} from "./bookingSteps";
import { balancesAfter } from "./previewBalances";
import { parseBooking } from "./parseBooking";
import type { TimeOffService } from "./timeOffService";
import type { WhosOutTimeOff } from "./whosOutService";

/** Booking and cancelling a person's time off. */
export interface BookTimeOffService {
  /** What booking or asking for it would cost and do, without writing anything; for whoever may create it. */
  previewBooking(ctx: SecurityContext, input: BookingInput): Promise<BookingPreview>;
  /** Books approved time off for its working days and runs the allowance engine; refuses whoever may only ask for it. */
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

const writeModes = createWriteModeService();

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
  const dependencies = bookingDependencies({ orm, transact, logger, timeOff, bankHolidays, today });
  return {
    previewBooking: (ctx, input) => previewBooking(dependencies, ctx, input),
    bookTimeOff: (ctx, input) => bookTimeOff(dependencies, ctx, input),
    cancelTimeOff: (ctx, input) => cancelTimeOff(dependencies, ctx, input),
  };
}

/** What booking would cost and do: the booking is made and the engine run, then rolled back. */
async function previewBooking(
  dependencies: BookingDependencies,
  ctx: SecurityContext,
  input: BookingInput,
): Promise<BookingPreview> {
  const booking = parseBooking(input);
  // Whoever may create the time off previews it, including someone who may only ask for it.
  await ctx.requireInScope("time_off", "create", booking.employeeId);
  try {
    return await dependencies.transact(async (tx) => {
      const person = await begin(dependencies, tx, booking);
      const { days, refusal } = await checkBooking(dependencies, tx, booking, person);
      const cost = totalCost(days);
      if (refusal) {
        return { days, cost, balances: [], refusal };
      }
      // Rolled back with the rest: waiting days count as taken, so "before" is what is free now.
      await timeOffRequestRepository(tx).approveRequested(booking.employeeId);
      const { booked } = await saveTimeOff(ctx, tx, booking, { days, status: "approved" });
      await ensureBooked(dependencies, ctx, tx, { employeeId: booking.employeeId, id: null });
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
  await writeModes.requireDirectCreate(ctx, "time_off", booking.employeeId, NEEDS_REQUEST);
  const result = await dependencies.transact(async (tx) => {
    const person = await begin(dependencies, tx, booking);
    const { days, refusal } = await checkBooking(dependencies, tx, booking, person);
    if (refusal) {
      throw invalidInput([{ field: "dates", code: refusal.reason }]);
    }
    const saved = await saveTimeOff(ctx, tx, booking, { days, status: "approved" });
    const ensured = await ensureBooked(dependencies, ctx, tx, {
      employeeId: booking.employeeId,
      id: saved.id,
    });
    return { ...saved, ensured };
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
    status: "approved",
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
    if (found.status !== "approved") {
      throw new ApplicationError("CONFLICT", NOT_CANCELLABLE[found.status]);
    }
    // A closed leave year is never recalculated, so its days could not go back.
    const { people } = await readPeople(employeeReads, tx, [found.employeeId]);
    if (found.firstDate < windowOf(people[0]!, found.timeOffTypeId, today()).start) {
      throw new ApplicationError("CONFLICT", "This booking is in a leave year that has closed.");
    }
    await repository.cancel(timeOffId!);
    await appendStatusChange(ctx, tx, {
      id: timeOffId!,
      from: "approved",
      to: "cancelled",
      cause: { kind: "EDITED_DIRECTLY" },
    });
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

/** Runs the engine for the person after booking, the booking's id its cause. */
function ensureBooked(
  { timeOff }: BookingDependencies,
  ctx: SecurityContext,
  tx: Tx,
  { employeeId, id }: { employeeId: string; id: string | null },
) {
  return timeOff.ensureAllowances(ctx, tx, {
    employeeIds: [employeeId],
    cause: { kind: "TIME_OFF_BOOKED", ref: id },
  });
}

/** Why only approved time off is cancelled, by its status: anything else would undo nothing or skip its approval. */
const NOT_CANCELLABLE: Record<Exclude<TimeOffStatus, "approved">, string> = {
  requested: "This time off is waiting for approval.",
  rejected: "This time off was rejected.",
  cancelled: "This booking is already cancelled.",
};

/** Why booking refuses a caller who may only ask for this person's time off, such as their own. */
const NEEDS_REQUEST = "Your time off needs to be requested.";

/** Thrown to roll a preview's writes back, carrying what it found. */
class PreviewDone extends Error {
  constructor(readonly preview: BookingPreview) {
    super("Preview done");
  }
}
