import { invalidInput } from "../../../core/applicationError";
import type { Tx } from "../../../core/db";
import {
  isInRecordScope,
  PrincipalSecurityContext,
  type RecordScope,
  type SecurityContext,
} from "../../../core/security";
import { type CalendarDate, daysBetween, isWithin, parseUuid } from "../../../utils";
import { BANK_HOLIDAY_CALENDARS } from "../../bankHolidays";
import { parseDateField } from "../../employees";
import { type Booking, timeOffPolicyRepository, timeOffRepository } from "../db";
import { costedDays, datesFrom, totalCost } from "../domain";
import type { BookingDependencies } from "./bookTimeOff";
import type { WhosOut } from "./timeOffBookingService";

const MAX_WHOS_OUT_DAYS = 62;

/**
 * Each readable person's dates and bookings from `from` to `until`; the type of a private
 * booking, its cost and note only for who may read the person's time off.
 */
export async function readWhosOut(
  dependencies: BookingDependencies,
  ctx: SecurityContext,
  input: { employeeIds: readonly string[]; from: string; until: string },
): Promise<Map<string, WhosOut>> {
  const range = parseRange(input);
  const employeeIds = await readableIds(ctx, input.employeeIds);
  if (employeeIds.length === 0) {
    return new Map();
  }
  const timeOffScope = await ctx.recordScope("time_off", "read");
  return await dependencies.transact(async (tx) => {
    const facts = await readFacts(dependencies, tx, employeeIds, range);
    return new Map(
      employeeIds.map((employeeId) => [
        employeeId,
        whosOutOf(facts, employeeId, range, timeOffScope),
      ]),
    );
  });
}

type Range = { from: CalendarDate; until: CalendarDate };
type Facts = Awaited<ReturnType<typeof readFacts>>;

function parseRange(input: { from: string; until: string }): Range {
  const from = parseDateField("from", input.from);
  const until = parseDateField("until", input.until);
  if (until < from) {
    throw invalidInput([{ field: "until", code: "before_from" }]);
  }
  if (daysBetween(from, until) + 1 > MAX_WHOS_OUT_DAYS) {
    throw invalidInput([{ field: "until", code: "too_long" }]);
  }
  return { from, until };
}

async function readableIds(
  ctx: SecurityContext,
  employeeIds: readonly string[],
): Promise<string[]> {
  const scope = await ctx.recordScope("employee", "read");
  return [...new Set(employeeIds.map(parseUuid).filter((id): id is string => id !== null))].filter(
    (id) => isInRecordScope(scope, id),
  );
}

/** Employments, bookings, types, and the weeks and bank holidays over every booked day too. */
async function readFacts(
  { employeeReads, workingWeeks, bankHolidays }: BookingDependencies,
  tx: Tx,
  employeeIds: readonly string[],
  range: Range,
) {
  const [periods, bookings, types] = await Promise.all([
    employeeReads.readEmploymentPeriods(tx, employeeIds),
    timeOffRepository(tx).findBookings({ employeeIds, ...range }),
    timeOffPolicyRepository(tx).findAllTypes(),
  ]);
  // Bookings may run past the range; their costs need the weeks of their own days.
  const span = {
    from: [range.from, ...bookings.map(({ days }) => days[0]!.date)].toSorted()[0]!,
    until: [range.until, ...bookings.map(({ days }) => days.at(-1)!.date)].toSorted().at(-1)!,
  };
  const [weeks, holidays] = await Promise.all([
    workingWeeks.readWorkingWeeksInTransaction(tx, { employeeIds, ...span }),
    bankHolidays.readBankHolidays(PrincipalSecurityContext.system(), {
      calendars: BANK_HOLIDAY_CALENDARS,
      ...span,
    }),
  ]);
  return {
    periods,
    weeks,
    holidays,
    bookingsOf: Map.groupBy(bookings, ({ employeeId }) => employeeId),
    privateTypeIds: new Set(types.filter((type) => type.private).map(({ id }) => id)),
  };
}

function whosOutOf(
  facts: Facts,
  employeeId: string,
  range: Range,
  timeOffScope: RecordScope,
): WhosOut {
  const costed = (days: Booking["days"]) =>
    costedDays({
      from: days[0]!.date,
      until: days.at(-1)!.date,
      halfDays: new Map(days.map(({ date, dayPart }) => [date, dayPart])),
      workingWeeks: facts.weeks.get(employeeId) ?? [],
      bankHolidays: facts.holidays,
    }).filter(({ date }) => days.some((day) => day.date === date));
  const employed = facts.periods.get(employeeId) ?? [];
  const readable = isInRecordScope(timeOffScope, employeeId);
  const rangeDays = datesFrom(range.from, range.until).map((date) => ({
    date,
    dayPart: "full_day" as const,
  }));
  return {
    days: costed(rangeDays).map(({ date, reason, bankHolidayName }) => ({
      date,
      kind: employed.some(({ startDate, endDate }) => isWithin(date, startDate, endDate))
        ? reason
        : "not_employed",
      bankHolidayName,
    })),
    timeOff: (facts.bookingsOf.get(employeeId) ?? []).map((booking) => ({
      id: booking.id,
      timeOffTypeId:
        readable || !facts.privateTypeIds.has(booking.timeOffTypeId) ? booking.timeOffTypeId : null,
      days: booking.days,
      cost: readable ? totalCost(costed(booking.days)) : null,
      note: readable ? booking.note : null,
      bookedAt: readable ? booking.createdAt : null,
    })),
  };
}
