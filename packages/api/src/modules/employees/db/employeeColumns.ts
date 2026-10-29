import { eq, getTableColumns, sql, type SQLWrapper } from "drizzle-orm";
import { type PgColumn, QueryBuilder } from "drizzle-orm/pg-core";

import { employees } from "./employeesTable";
import { employments } from "./employmentsTable";

/**
 * Every column of an employee, and their start date: the start of their first employment, an
 * unknown start counting as the earliest.
 */
export const EMPLOYEE_COLUMNS = {
  ...getTableColumns(employees),
  startDate: sql`${firstEmploymentOf(employees.id, employments.startDate)}`.mapWith(
    employments.startDate,
  ),
};

/** A query for the id, or `column`, of the employee's first employment. */
export function firstEmploymentOf(
  employeeId: string | SQLWrapper,
  column: PgColumn = employments.id,
) {
  return new QueryBuilder()
    .select({ value: column })
    .from(employments)
    .where(eq(employments.employeeId, employeeId))
    .orderBy(sql`${employments.startDate} nulls first`)
    .limit(1);
}
