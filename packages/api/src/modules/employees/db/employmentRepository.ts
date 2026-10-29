import { eq, type SQL, sql } from "drizzle-orm";

import { type Orm, ormOf, type Tx } from "../../../core/db";
import type { CalendarDate } from "../../../utils";
import { employments } from "./employmentsTable";

/** Employments stored in Postgres, through the pool or inside a transaction. */
export interface EmploymentRepository {
  /** Holds back other manager changes until the caller commits, so two cannot form a loop together. */
  lockManagers(): Promise<void>;
  /** The direct manager of each employee's employment held on `date`; those without one are left out. */
  findManagerIds(employeeIds: readonly string[], date: CalendarDate): Promise<Map<string, string>>;
  /**
   * Everyone above each employee in reporting lines active on `date`: their manager first, that
   * one's, and so on, in one query; employees without a manager are left out.
   */
  findManagersAbove(
    employeeIds: readonly string[],
    date: CalendarDate,
  ): Promise<Map<string, string[]>>;
  /**
   * Everyone below the manager in reporting lines active on `date`, in one query, with their
   * depth: 1 for a direct report, 2 for theirs, and so on.
   */
  findReportsBelow(managerId: string, date: CalendarDate): Promise<{ id: string; depth: number }[]>;
  /** Sets the manager of the employment held on `date`; throws when the employee holds none. */
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
            and ${employments.directManagerId} is not null and ${heldOn(date)}`,
        );
      return new Map(rows.map(({ employeeId, managerId }) => [employeeId, managerId!]));
    },

    findManagersAbove: async (employeeIds, date) => {
      // `cycle` stops a line at a manager already found in it, so a loop in stored data still ends.
      const rows = await orm().execute<{ start: string; id: string }>(sql`
        with recursive above(start, id, depth) as (
          select ${employments.employeeId}, ${employments.directManagerId}, 1 from ${employments}
          where ${employments.employeeId} = any(${sql.param([...employeeIds])}::uuid[])
            and ${heldOn(date)}
          union all
          select above.start, e.direct_manager_id, above.depth + 1 from ${employments} e
          join above on e.employee_id = above.id
          where ${heldOn(date, sql`e`)}
        ) cycle id set is_loop using path
        select start, id from above where id is not null and not is_loop order by start, depth`);
      const above = new Map<string, string[]>();
      for (const { start, id } of rows.rows) {
        above.set(start, [...(above.get(start) ?? []), id]);
      }
      return above;
    },

    findReportsBelow: async (managerId, date) => {
      // `cycle` stops a line at a report already found in it, so a loop in stored data still ends.
      const rows = await orm().execute<{ id: string; depth: number }>(sql`
        with recursive below(id, depth) as (
          select ${employments.employeeId}, 1 from ${employments}
          where ${employments.directManagerId} = ${managerId} and ${heldOn(date)}
          union all
          select e.employee_id, below.depth + 1 from ${employments} e
          join below on e.direct_manager_id = below.id
          where ${heldOn(date, sql`e`)}
        ) cycle id set is_loop using path
        select id, min(depth)::int as depth from below where not is_loop group by id`);
      return rows.rows;
    },

    setManager: async (employeeId, managerId, date) => {
      const updated = await orm()
        .update(employments)
        .set({ directManagerId: managerId })
        .where(sql`${employments.employeeId} = ${employeeId} and ${heldOn(date)}`)
        .returning({ id: employments.id });
      if (updated.length === 0) {
        throw new Error(`Employee ${employeeId} has no employment on or after ${date}`);
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

/**
 * Whether `employment` is the one its person holds on `date`: the one active then or, before it
 * starts, their next one.
 */
function heldOn(date: CalendarDate, employment: SQL = sql`${employments}`) {
  return sql`${employment}.id = (
    select held.id from ${employments} held
    where held.employee_id = ${employment}.employee_id
      and (held.end_date is null or held.end_date >= ${date}::date)
    order by held.start_date nulls first limit 1)`;
}
