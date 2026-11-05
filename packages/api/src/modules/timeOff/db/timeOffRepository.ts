import { and, between, eq, inArray, isNull, sql } from "drizzle-orm";

import { ormOf, type Tx } from "../../../core/db";
import type { CalendarDate } from "../../../utils";
import { timeOff } from "./timeOffTable";
import { timeOffDays } from "./timeOffDaysTable";

/** People's time off, inside a transaction. */
export interface TimeOffRepository {
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
  const days = sql<string>`sum(case when ${timeOffDays.dayPart} = 'full_day' then 1 else 0.5 end)`;
  const counted = (from: CalendarDate, until: CalendarDate) =>
    and(
      inArray(timeOff.status, ["approved", "pending_approval"]),
      isNull(timeOffDays.cancelledAt),
      between(timeOffDays.date, from, until),
    );
  return {
    async sumRecordedDays({ employeeIds, from, until }) {
      const rows = await ormOf(tx)
        .select({
          employeeId: timeOff.employeeId,
          timeOffTypeId: timeOff.timeOffTypeId,
          year: yearOfDay,
          days,
        })
        .from(timeOffDays)
        .innerJoin(timeOff, eq(timeOff.id, timeOffDays.timeOffId))
        .where(and(inArray(timeOff.employeeId, [...employeeIds]), counted(from, until)))
        .groupBy(timeOff.employeeId, timeOff.timeOffTypeId, yearOfDay);
      return rows.map((row) => ({ ...row, days: Number(row.days) }));
    },
    async sumDaysByType({ from, until }) {
      const rows = await ormOf(tx)
        .select({ timeOffTypeId: timeOff.timeOffTypeId, days })
        .from(timeOffDays)
        .innerJoin(timeOff, eq(timeOff.id, timeOffDays.timeOffId))
        .where(counted(from, until))
        .groupBy(timeOff.timeOffTypeId);
      return rows.map((row) => ({ ...row, days: Number(row.days) }));
    },
  };
}
