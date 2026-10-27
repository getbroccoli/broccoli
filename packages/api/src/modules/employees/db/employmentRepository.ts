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
  /** Everyone above `managerId` in reporting lines active on `date`: their manager, that one's, and so on. */
  findManagersAbove(managerId: string, date: CalendarDate): Promise<string[]>;
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

    findManagersAbove: async (managerId, date) => {
      // `union` drops rows already found, so a loop in stored data still ends.
      const rows = await orm().execute<{ id: string }>(sql`
        with recursive above(id) as (
          select ${employments.directManagerId} from ${employments}
          where ${employments.employeeId} = ${managerId} and ${activeOn(date)}
          union
          select e.direct_manager_id from ${employments} e join above on e.employee_id = above.id
          where daterange(e.start_date, e.end_date, '[]') @> ${date}::date
        )
        select id from above where id is not null`);
      return rows.rows.map(({ id }) => id);
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
