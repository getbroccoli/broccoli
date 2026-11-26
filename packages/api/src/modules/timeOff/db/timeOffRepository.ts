import { and, asc, between, eq, gte, inArray, isNull, sql } from "drizzle-orm";

import { anyOf, type Orm, ormOf, type Tx } from "../../../core/db";
import type { CalendarDate } from "../../../utils";
import type { DayPart } from "../domain";
import { timeOff } from "./timeOffTable";
import { timeOffDays } from "./timeOffDaysTable";
import { DAY_COLUMNS, groupDays, TIME_OFF_COLUMNS } from "./timeOffRows";

/** Where time off stands: requested and waiting for approval, approved, rejected or cancelled. */
export type TimeOffStatus = (typeof timeOff.$inferSelect)["status"];

/** Time off that holds its days: approved, or requested and waiting for approval. */
export const HELD: readonly TimeOffStatus[] = ["approved", "requested"];

/** A day of time off that has not been cancelled. */
export interface BookedDay {
  timeOffDayId: string;
  timeOffId: string;
  employeeId: string;
  timeOffTypeId: string;
  date: CalendarDate;
  dayPart: DayPart;
}

/** Time off with every one of its days. */
export interface Booking {
  id: string;
  employeeId: string;
  timeOffTypeId: string;
  status: TimeOffStatus;
  note: string | null;
  createdAt: Date;
  /** Oldest first. */
  days: { date: CalendarDate; dayPart: DayPart }[];
}

/** People's time off, inside a transaction. */
export interface TimeOffRepository {
  /**
   * The people's days of time off with these statuses (approved unless given) from `from` on, up
   * to `until` when given, oldest first.
   */
  findBookedDays(input: {
    employeeIds: readonly string[];
    from: CalendarDate;
    until?: CalendarDate;
    statuses?: readonly TimeOffStatus[];
  }): Promise<BookedDay[]>;
  /**
   * The people's time off that holds its days with a day from `from` to `until`, oldest first:
   * approved, and requested for `requestedOf`, whose time off the reader may read.
   */
  findBookings(input: {
    employeeIds: readonly string[];
    from: CalendarDate;
    until: CalendarDate;
    requestedOf: (employeeId: string) => boolean;
  }): Promise<Booking[]>;
  /**
   * Time off with its days, approved or requested; returns its id and when it was saved. Requested
   * time off records when it was asked for.
   */
  insertTimeOff(input: {
    employeeId: string;
    timeOffTypeId: string;
    status: "approved" | "requested";
    note: string | null;
    createdByUserId: string | null;
    days: readonly { date: CalendarDate; dayPart: DayPart }[];
  }): Promise<{ id: string; createdAt: Date }>;
  /** Whose time off this is, without locking it; null when there is none. */
  findEmployeeId(id: string): Promise<string | null>;
  /** The time off's person, status and first day, locked until the transaction ends; null when there is none. */
  lockTimeOff(id: string): Promise<{
    employeeId: string;
    timeOffTypeId: string;
    status: TimeOffStatus;
    firstDate: CalendarDate;
  } | null>;
  /** Marks the time off cancelled; its days stay. */
  cancel(id: string): Promise<void>;
  /**
   * Days of approved time off from `from` to `until`, per employee, type and calendar year: a
   * full day counts 1, a morning or an afternoon 0.5. Rejected and cancelled days count nothing.
   */
  sumRecordedDays(input: {
    employeeIds: readonly string[];
    from: CalendarDate;
    until: CalendarDate;
  }): Promise<{ employeeId: string; timeOffTypeId: string; year: number; days: number }[]>;
  /** Everyone's days from `from` to `until` per type, counted as `sumRecordedDays` counts them. */
  sumDaysByType(input: {
    from: CalendarDate;
    until: CalendarDate;
  }): Promise<{ timeOffTypeId: string; days: number }[]>;
  /** The days from `from` on that `employeeIds` have approved or requested time off of the type. */
  findDaysFrom(input: {
    employeeIds: readonly string[];
    timeOffTypeId: string;
    from: CalendarDate;
  }): Promise<{ employeeId: string; date: CalendarDate }[]>;
}

export function timeOffRepository(tx: Orm | Tx): TimeOffRepository {
  const yearOfDay = sql<number>`extract(year from ${timeOffDays.date})::int`;
  return {
    async findBookedDays({ employeeIds, from, until, statuses = ["approved"] }) {
      return await ormOf(tx)
        .select({
          timeOffDayId: timeOffDays.id,
          timeOffId: timeOff.id,
          employeeId: timeOff.employeeId,
          timeOffTypeId: timeOff.timeOffTypeId,
          date: timeOffDays.date,
          dayPart: timeOffDays.dayPart,
        })
        .from(timeOffDays)
        .innerJoin(timeOff, eq(timeOff.id, timeOffDays.timeOffId))
        .where(
          and(
            anyOf(timeOff.employeeId, employeeIds),
            inArray(timeOff.status, statuses),
            isNull(timeOffDays.cancelledAt),
            until ? between(timeOffDays.date, from, until) : gte(timeOffDays.date, from),
          ),
        )
        .orderBy(asc(timeOffDays.date));
    },
    async findBookings({ employeeIds, from, until, requestedOf }) {
      const inRange = ormOf(tx)
        .select({ id: timeOffDays.timeOffId })
        .from(timeOffDays)
        .where(and(between(timeOffDays.date, from, until), isNull(timeOffDays.cancelledAt)));
      const rows = await ormOf(tx)
        .select({ timeOff: TIME_OFF_COLUMNS, day: DAY_COLUMNS })
        .from(timeOff)
        .innerJoin(timeOffDays, eq(timeOffDays.timeOffId, timeOff.id))
        .where(
          and(
            anyOf(timeOff.employeeId, employeeIds),
            inArray(timeOff.status, HELD),
            isNull(timeOffDays.cancelledAt),
            inArray(timeOff.id, inRange),
          ),
        )
        .orderBy(asc(timeOffDays.date), asc(timeOff.id));
      return groupDays(rows).filter(
        ({ status, employeeId }) => status === "approved" || requestedOf(employeeId),
      );
    },
    async insertTimeOff({ days, status, ...input }) {
      const [saved] = await ormOf(tx)
        .insert(timeOff)
        .values({ ...input, status, requestedAt: status === "requested" ? sql`now()` : null })
        .returning({ id: timeOff.id, createdAt: timeOff.createdAt });
      await ormOf(tx)
        .insert(timeOffDays)
        .values(days.map((day) => ({ ...day, timeOffId: saved!.id })));
      return saved!;
    },
    async findEmployeeId(id) {
      const [row] = await ormOf(tx)
        .select({ employeeId: timeOff.employeeId })
        .from(timeOff)
        .where(eq(timeOff.id, id));
      return row?.employeeId ?? null;
    },
    async lockTimeOff(id) {
      const [row] = await ormOf(tx)
        .select({
          employeeId: timeOff.employeeId,
          timeOffTypeId: timeOff.timeOffTypeId,
          status: timeOff.status,
        })
        .from(timeOff)
        .where(eq(timeOff.id, id))
        .for("update");
      if (!row) {
        return null;
      }
      const [first] = await ormOf(tx)
        .select({ date: sql<CalendarDate>`min(${timeOffDays.date})` })
        .from(timeOffDays)
        .where(eq(timeOffDays.timeOffId, id));
      return { ...row, firstDate: first!.date };
    },
    async cancel(id) {
      await ormOf(tx).update(timeOff).set({ status: "cancelled" }).where(eq(timeOff.id, id));
    },
    async sumRecordedDays({ employeeIds, from, until }) {
      const rows = await ormOf(tx)
        .select({
          employeeId: timeOff.employeeId,
          timeOffTypeId: timeOff.timeOffTypeId,
          year: yearOfDay,
          days: dayCount,
        })
        .from(timeOffDays)
        .innerJoin(timeOff, eq(timeOff.id, timeOffDays.timeOffId))
        .where(and(anyOf(timeOff.employeeId, employeeIds), daysIn(["approved"], from, until)))
        .groupBy(timeOff.employeeId, timeOff.timeOffTypeId, yearOfDay);
      return rows.map((row) => ({ ...row, days: Number(row.days) }));
    },
    async sumDaysByType({ from, until }) {
      const rows = await ormOf(tx)
        .select({ timeOffTypeId: timeOff.timeOffTypeId, days: dayCount })
        .from(timeOffDays)
        .innerJoin(timeOff, eq(timeOff.id, timeOffDays.timeOffId))
        .where(daysIn(["approved"], from, until))
        .groupBy(timeOff.timeOffTypeId);
      return rows.map((row) => ({ ...row, days: Number(row.days) }));
    },
    async findDaysFrom({ employeeIds, timeOffTypeId, from }) {
      return ormOf(tx)
        .selectDistinct({ employeeId: timeOff.employeeId, date: timeOffDays.date })
        .from(timeOffDays)
        .innerJoin(timeOff, eq(timeOff.id, timeOffDays.timeOffId))
        .where(
          and(
            anyOf(timeOff.employeeId, employeeIds),
            eq(timeOff.timeOffTypeId, timeOffTypeId),
            daysIn(HELD, from, LAST_DAY),
          ),
        );
    },
  };
}

/** A day after any time off, for "from a date on". */
const LAST_DAY = "9999-12-31" as CalendarDate;

/** A full day counts 1, a morning or an afternoon 0.5. */
const dayCount = sql<string>`sum(case when ${timeOffDays.dayPart} = 'full_day' then 1 else 0.5 end)`;

/** Days of time off with one of these statuses from `from` to `until`, not cancelled on their own. */
function daysIn(statuses: readonly TimeOffStatus[], from: CalendarDate, until: CalendarDate) {
  return and(
    inArray(timeOff.status, statuses),
    isNull(timeOffDays.cancelledAt),
    between(timeOffDays.date, from, until),
  );
}
