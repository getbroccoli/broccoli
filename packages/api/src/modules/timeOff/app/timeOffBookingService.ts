import type { ModuleDependencies } from "../../../core/moduleManifest";
import type { SecurityContext } from "../../../core/security";
import { type CalendarDate, todayInLondon } from "../../../utils";
import type { BankHolidayService } from "../../bankHolidays";
import { createEmployeeReadService, createEmployeeWorkingPatternService } from "../../employees";
import { timeOffPolicyRepository } from "../db";
import type { BookingRefusal, CostedDay, DayPart, TimeOffType } from "../domain";
import { bookTimeOff, cancelTimeOff, previewBooking } from "./bookTimeOff";
import { readWhosOut } from "./readWhosOut";
import type { TimeOffService } from "./timeOffService";

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

/** One person's dates and bookings over a range, as the Time off page shows them. */
export interface WhosOut {
  days: {
    date: CalendarDate;
    kind: "working_day" | "not_a_working_day" | "bank_holiday" | "not_employed";
    bankHolidayName: string | null;
  }[];
  timeOff: WhosOutTimeOff[];
}

/** A booking as one reader may see it. */
export interface WhosOutTimeOff {
  id: string;
  /** Null for a private type when the reader may not read the person's time off. */
  timeOffTypeId: string | null;
  days: { date: CalendarDate; dayPart: DayPart }[];
  /** Null unless the reader may read the person's time off. */
  cost: number | null;
  note: string | null;
  bookedAt: Date | null;
}

/** Booking and cancelling a person's time off, and who's out over a range. */
export interface TimeOffBookingService {
  /** What booking would cost and do, without writing anything. Admins only, for now. */
  previewBooking(ctx: SecurityContext, input: BookingInput): Promise<BookingPreview>;
  /** Books approved time off for its working days and runs the allowance engine. Admins only, for now. */
  bookTimeOff(ctx: SecurityContext, input: BookingInput): Promise<BookedTimeOff>;
  /** Cancels a whole booking, giving its days back. Admins only, for now. */
  cancelTimeOff(ctx: SecurityContext, input: { timeOffId: string }): Promise<void>;
  /**
   * Each person's dates and bookings from `from` to `until`, at most 62 days, for everyone signed
   * in; the type of a private booking, its cost and note only for who may read their time off.
   */
  readWhosOut(
    ctx: SecurityContext,
    input: { employeeIds: readonly string[]; from: string; until: string },
  ): Promise<Map<string, WhosOut>>;
  /** Every time off type, for anyone reading bookings: names and looks are not private. */
  readTypes(ctx: SecurityContext): Promise<TimeOffType[]>;
}

export function createTimeOffBookingService({
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
}): TimeOffBookingService {
  const employeeReads = createEmployeeReadService({ orm });
  const workingWeeks = createEmployeeWorkingPatternService({ transact, logger, today });
  const dependencies = {
    transact,
    logger,
    timeOff,
    employeeReads,
    workingWeeks,
    bankHolidays,
    today,
  };
  return {
    previewBooking: (ctx, input) => previewBooking(dependencies, ctx, input),
    bookTimeOff: (ctx, input) => bookTimeOff(dependencies, ctx, input),
    cancelTimeOff: (ctx, input) => cancelTimeOff(dependencies, ctx, input),
    readWhosOut: (ctx, input) => readWhosOut(dependencies, ctx, input),
    readTypes: () => transact((tx) => timeOffPolicyRepository(tx).findAllTypes()),
  };
}
