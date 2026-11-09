import { and, asc, between, eq, gte, inArray, isNull, sql } from "drizzle-orm";

import { ormOf, type Tx } from "../../../core/db";
import type { CalendarDate } from "../../../utils";
import type { DayPart } from "../domain";
import { timeOff } from "./timeOffTable";
import { timeOffDays } from "./timeOffDaysTable";

/** A day of approved time off that has not been cancelled. */
export interface BookedDay {
  timeOffDayId: string;
  timeOffId: string;
  employeeId: string;
  timeOffTypeId: string;
  date: CalendarDate;
  dayPart: DayPart;
}

/** Approved time off with every one of its days. */
export interface Booking {
  id: string;
  employeeId: string;
  timeOffTypeId: string;
  note: string | null;
  createdAt: Date;
  /** Oldest first. */
  days: { date: CalendarDate; dayPart: DayPart }[];
}

/** People's time off, inside a transaction. */
export interface TimeOffRepository {
  /** The people's booked days from `from` on, up to `until` when given, oldest first. */
  findBookedDays(input: {
    employeeIds: readonly string[];
    from: CalendarDate;
    until?: CalendarDate;
  }): Promise<BookedDay[]>;
  /** The people's approved time off with a day from `from` to `until`, oldest first. */
  findBookings(input: {
    employeeIds: readonly string[];
    from: CalendarDate;
    until: CalendarDate;
  }): Promise<Booking[]>;
  /** Approved time off with its days; returns its id and when it was saved. */
  insertBooking(input: {
    employeeId: string;
    timeOffTypeId: string;
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
    status: string;
    firstDate: CalendarDate;
  } | null>;
  /** Marks the time off cancelled; its days stay. */
  cancel(id: string): Promise<void>;
  /**
   * Days of approved or pending time off from `from` to `until`, per employee, type and calendar
   * year: a full day counts 1, a morning or an afternoon 0.5. Declined, cancelled and cancelled
   * days count nothing.
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
}

export function timeOffRepository(tx: Tx): TimeOffRepository {
  const yearOfDay = sql<number>`extract(year from ${timeOffDays.date})::int`;
  return {
    async findBookedDays({ employeeIds, from, until }) {
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
            inArray(timeOff.employeeId, [...employeeIds]),
            eq(timeOff.status, "approved"),
            isNull(timeOffDays.cancelledAt),
            until ? between(timeOffDays.date, from, until) : gte(timeOffDays.date, from),
          ),
        )
        .orderBy(asc(timeOffDays.date));
    },
    async findBookings({ employeeIds, from, until }) {
      const inRange = ormOf(tx)
        .select({ id: timeOffDays.timeOffId })
        .from(timeOffDays)
        .where(and(between(timeOffDays.date, from, until), isNull(timeOffDays.cancelledAt)));
      const rows = await ormOf(tx)
        .select({
          id: timeOff.id,
          employeeId: timeOff.employeeId,
          timeOffTypeId: timeOff.timeOffTypeId,
          note: timeOff.note,
          createdAt: timeOff.createdAt,
          date: timeOffDays.date,
          dayPart: timeOffDays.dayPart,
        })
        .from(timeOff)
        .innerJoin(timeOffDays, eq(timeOffDays.timeOffId, timeOff.id))
        .where(
          and(
            inArray(timeOff.employeeId, [...employeeIds]),
            eq(timeOff.status, "approved"),
            isNull(timeOffDays.cancelledAt),
            inArray(timeOff.id, inRange),
          ),
        )
        .orderBy(asc(timeOffDays.date), asc(timeOff.id));
      return [...Map.groupBy(rows, ({ id }) => id).values()].map((days) => ({
        id: days[0]!.id,
        employeeId: days[0]!.employeeId,
        timeOffTypeId: days[0]!.timeOffTypeId,
        note: days[0]!.note,
        createdAt: days[0]!.createdAt,
        days: days.map(({ date, dayPart }) => ({ date, dayPart })),
      }));
    },
    async insertBooking({ days, ...booking }) {
      const [saved] = await ormOf(tx)
        .insert(timeOff)
        .values({ ...booking, status: "approved" })
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
        .where(and(inArray(timeOff.employeeId, [...employeeIds]), counted(from, until)))
        .groupBy(timeOff.employeeId, timeOff.timeOffTypeId, yearOfDay);
      return rows.map((row) => ({ ...row, days: Number(row.days) }));
    },
    async sumDaysByType({ from, until }) {
      const rows = await ormOf(tx)
        .select({ timeOffTypeId: timeOff.timeOffTypeId, days: dayCount })
        .from(timeOffDays)
        .innerJoin(timeOff, eq(timeOff.id, timeOffDays.timeOffId))
        .where(counted(from, until))
        .groupBy(timeOff.timeOffTypeId);
      return rows.map((row) => ({ ...row, days: Number(row.days) }));
    },
  };
}

/** A full day counts 1, a morning or an afternoon 0.5. */
const dayCount = sql<string>`sum(case when ${timeOffDays.dayPart} = 'full_day' then 1 else 0.5 end)`;

/** Days of approved or pending time off from `from` to `until`, not cancelled on their own. */
function counted(from: CalendarDate, until: CalendarDate) {
  return and(
    inArray(timeOff.status, ["approved", "pending_approval"]),
    isNull(timeOffDays.cancelledAt),
    between(timeOffDays.date, from, until),
  );
}
