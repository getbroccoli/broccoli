import { invalidInput } from "../../../core/applicationError";
import type { Tx } from "../../../core/db";
import type { ModuleDependencies } from "../../../core/moduleManifest";
import {
  isInRecordScope,
  PrincipalSecurityContext,
  type RecordScope,
  type SecurityContext,
} from "../../../core/security";
import { type CalendarDate, daysBetween, isWithin, parseUuid, todayInLondon } from "../../../utils";
import { BANK_HOLIDAY_CALENDARS, type BankHolidayService } from "../../bankHolidays";
import {
  createEmployeeReadService,
  createEmployeeWorkingPatternService,
  type EmployeeReadService,
  type EmployeeWorkingPatternService,
  parseDateField,
} from "../../employees";
import {
  allowanceRepository,
  type Booking,
  timeOffPolicyRepository,
  timeOffRepository,
  type TimeOffStatus,
} from "../db";
import {
  type CostedDay,
  costedDays,
  type DayCostReason,
  type DayPart,
  datesFrom,
  type TimeOffType,
  totalCost,
} from "../domain";

/** Who's out over a range, as the Time off page shows it. */
export interface WhosOutService {
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

/** One person's dates and bookings over a range. */
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
  /** Approved for everyone; requested reaches only who may read the person's time off. */
  status: TimeOffStatus;
  /** Null unless the reader may read the person's time off. */
  cost: number | null;
  /**
   * Each day's cost and its reason under the person's working week and bank holidays on that
   * date; null unless the reader may read the person's time off, absent outside who's out.
   */
  dayCosts?: { date: CalendarDate; cost: number; reason: DayCostReason }[] | null;
  /**
   * Days approved time off takes from allowances now; null for requests, a type without allowance
   * lines and unless the reader may read the person's time off, absent outside who's out.
   */
  deductedDays?: number | null;
  note: string | null;
  bookedAt: Date | null;
}

const MAX_WHOS_OUT_DAYS = 62;

export function createWhosOutService({
  orm,
  transact,
  bankHolidays,
  today = todayInLondon,
}: Pick<ModuleDependencies, "orm" | "transact"> & {
  bankHolidays: BankHolidayService;
  today?: () => CalendarDate;
}): WhosOutService {
  const dependencies: Dependencies = {
    employeeReads: createEmployeeReadService({ orm }),
    workingWeeks: createEmployeeWorkingPatternService({ transact, today }),
    bankHolidays,
  };
  return {
    async readWhosOut(ctx, input) {
      const range = parseRange(input);
      const employeeIds = await readableIds(ctx, input.employeeIds);
      if (employeeIds.length === 0) {
        return new Map();
      }
      const timeOffScope = await ctx.recordScope("time_off", "read");
      return await transact(async (tx) => {
        const readable = (employeeId: string) => isInRecordScope(timeOffScope, employeeId);
        const facts = await readFacts(dependencies, tx, { employeeIds, range, readable });
        return new Map(
          employeeIds.map((employeeId) => [
            employeeId,
            whosOutOf(facts, employeeId, range, timeOffScope),
          ]),
        );
      });
    },
    readTypes: () => transact((tx) => timeOffPolicyRepository(tx).findAllTypes()),
  };
}

type Dependencies = {
  employeeReads: Pick<EmployeeReadService, "readEmploymentPeriods">;
  workingWeeks: Pick<EmployeeWorkingPatternService, "readWorkingWeeksInTransaction">;
  bankHolidays: BankHolidayService;
};
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
  { employeeReads, workingWeeks, bankHolidays }: Dependencies,
  tx: Tx,
  {
    employeeIds,
    range,
    readable,
  }: { employeeIds: readonly string[]; range: Range; readable: (employeeId: string) => boolean },
) {
  const [periods, bookings, types] = await Promise.all([
    employeeReads.readEmploymentPeriods(tx, employeeIds),
    // Requested time off only for who may read the person's time off.
    timeOffRepository(tx).findBookings({ employeeIds, ...range, requestedOf: readable }),
    timeOffPolicyRepository(tx).findAllTypes(),
  ]);
  // Readable bookings may run past the range; their costs need the weeks of their own days.
  const costed = bookings.filter(({ employeeId }) => readable(employeeId));
  const span = {
    from: [range.from, ...costed.map(({ days }) => days[0]!.date)].toSorted()[0]!,
    until: [range.until, ...costed.map(({ days }) => days.at(-1)!.date)].toSorted().at(-1)!,
  };
  const approvedIds = costed.filter(({ status }) => status === "approved").map(({ id }) => id);
  const [weeks, holidays, deductedDays] = await Promise.all([
    workingWeeks.readWorkingWeeksInTransaction(tx, { employeeIds, ...span }),
    bankHolidays.readBankHolidays(PrincipalSecurityContext.system(), {
      calendars: BANK_HOLIDAY_CALENDARS,
      ...span,
    }),
    allowanceRepository(tx).findDeductedDays(approvedIds),
  ]);
  return {
    periods,
    weeks,
    holidays,
    deductedDays,
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
  const costed = (days: Booking["days"]) => {
    const halfDays = new Map(days.map(({ date, dayPart }) => [date, dayPart]));
    return costedDays({
      from: days[0]!.date,
      until: days.at(-1)!.date,
      halfDays,
      workingWeeks: facts.weeks.get(employeeId) ?? [],
      bankHolidays: facts.holidays,
    }).filter(({ date }) => halfDays.has(date));
  };
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
    timeOff: (facts.bookingsOf.get(employeeId) ?? []).map((booking) =>
      timeOffAsShown(facts, booking, readable ? costed : null),
    ),
  };
}

/** A booking as its reader sees it: costed only when `costed` is given, for who may read it. */
function timeOffAsShown(
  facts: Facts,
  booking: Booking,
  costed: ((days: Booking["days"]) => CostedDay[]) | null,
): WhosOutTimeOff {
  const shown = {
    id: booking.id,
    timeOffTypeId:
      costed || !facts.privateTypeIds.has(booking.timeOffTypeId) ? booking.timeOffTypeId : null,
    days: booking.days,
    status: booking.status,
  };
  if (!costed) {
    return { ...shown, cost: null, dayCosts: null, deductedDays: null, note: null, bookedAt: null };
  }
  const dayCosts = costed(booking.days).map(({ date, cost, reason }) => ({ date, cost, reason }));
  return {
    ...shown,
    cost: totalCost(dayCosts),
    dayCosts,
    deductedDays: facts.deductedDays.get(booking.id) ?? null,
    note: booking.note,
    bookedAt: booking.createdAt,
  };
}
