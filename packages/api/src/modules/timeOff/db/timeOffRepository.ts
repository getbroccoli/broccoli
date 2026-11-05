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
}

export function timeOffRepository(tx: Tx): TimeOffRepository {
  const yearOfDay = sql<number>`extract(year from ${timeOffDays.date})::int`;
  return {
    async sumRecordedDays({ employeeIds, from, until }) {
      const rows = await ormOf(tx)
        .select({
          employeeId: timeOff.employeeId,
          timeOffTypeId: timeOff.timeOffTypeId,
          year: yearOfDay,
          days: sql<string>`sum(case when ${timeOffDays.dayPart} = 'full_day' then 1 else 0.5 end)`,
        })
        .from(timeOffDays)
        .innerJoin(timeOff, eq(timeOff.id, timeOffDays.timeOffId))
        .where(
          and(
            inArray(timeOff.employeeId, [...employeeIds]),
            inArray(timeOff.status, ["approved", "pending_approval"]),
            isNull(timeOffDays.cancelledAt),
            between(timeOffDays.date, from, until),
          ),
        )
        .groupBy(timeOff.employeeId, timeOff.timeOffTypeId, yearOfDay);
      return rows.map((row) => ({ ...row, days: Number(row.days) }));
    },
  };
}
