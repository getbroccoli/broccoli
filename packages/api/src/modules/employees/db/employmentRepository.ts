import { eq, sql } from "drizzle-orm";

import { type Orm, ormOf, type Tx } from "../../../core/db";
import type { CalendarDate } from "../../../utils";
import { employments } from "./employmentsTable";

/** Employments stored in Postgres, through the pool or inside a transaction. */
export interface EmploymentRepository {
  /** Holds back other manager changes until the caller commits, so two cannot form a loop together. */
  lockManagers(): Promise<void>;
  /** The direct manager of each employee's employment active on `date`; those without one are left out. */
  findManagerIds(employeeIds: readonly string[], date: CalendarDate): Promise<Map<string, string>>;
  /**
   * Everyone above each employee in reporting lines active on `date`: their manager first, that
   * one's, and so on, in one query; employees without a manager are left out.
   */
  findManagersAbove(
    employeeIds: readonly string[],
    date: CalendarDate,
  ): Promise<Map<string, string[]>>;
  /** Sets the manager of the employment active on `date`, starting an open one when there is none. */
  setManager(employeeId: string, managerId: string | null, date: CalendarDate): Promise<void>;
  /** Removes `managerId` as manager from every employment naming them; returns whose they were. */
  clearManager(managerId: string): Promise<string[]>;
}

export function employmentRepository(db: Orm | Tx): EmploymentRepository {
  const orm = () => ormOf(db);

  return {
    lockManagers: async () => {
      await orm().execute(sql`lock table ${employments} in share row exclusive mode`);
    },

    findManagerIds: async (employeeIds, date) => {
      const rows = await orm()
        .select({ employeeId: employments.employeeId, managerId: employments.directManagerId })
        .from(employments)
        .where(
          sql`${employments.employeeId} = any(${sql.param([...employeeIds])}::uuid[])
            and ${employments.directManagerId} is not null and ${activeOn(date)}`,
        );
      return new Map(rows.map(({ employeeId, managerId }) => [employeeId, managerId!]));
    },

    findManagersAbove: async (employeeIds, date) => {
      // `cycle` stops a line at a manager already found in it, so a loop in stored data still ends.
      const rows = await orm().execute<{ start: string; id: string }>(sql`
        with recursive above(start, id, depth) as (
          select ${employments.employeeId}, ${employments.directManagerId}, 1 from ${employments}
          where ${employments.employeeId} = any(${sql.param([...employeeIds])}::uuid[])
            and ${activeOn(date)}
          union all
          select above.start, e.direct_manager_id, above.depth + 1 from ${employments} e
          join above on e.employee_id = above.id
          where daterange(e.start_date, e.end_date, '[]') @> ${date}::date
        ) cycle id set is_loop using path
        select start, id from above where id is not null and not is_loop order by start, depth`);
      const above = new Map<string, string[]>();
      for (const { start, id } of rows.rows) {
        above.set(start, [...(above.get(start) ?? []), id]);
      }
      return above;
    },

    setManager: async (employeeId, managerId, date) => {
      const updated = await orm()
        .update(employments)
        .set({ directManagerId: managerId })
        .where(sql`${employments.employeeId} = ${employeeId} and ${activeOn(date)}`)
        .returning({ id: employments.id });
      if (updated.length === 0) {
        await orm().insert(employments).values({ employeeId, directManagerId: managerId });
      }
    },

    clearManager: async (managerId) => {
      const rows = await orm()
        .update(employments)
        .set({ directManagerId: null })
        .where(eq(employments.directManagerId, managerId))
        .returning({ employeeId: employments.employeeId });
      return [...new Set(rows.map(({ employeeId }) => employeeId))];
    },
  };
}

function activeOn(date: CalendarDate) {
  return sql`daterange(${employments.startDate}, ${employments.endDate}, '[]') @> ${date}::date`;
}
