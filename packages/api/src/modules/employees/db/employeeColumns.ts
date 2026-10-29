import { getTableColumns, sql, type SQLWrapper } from "drizzle-orm";

import { employees } from "./employeesTable";
import { employments } from "./employmentsTable";

/**
 * Every column of an employee, and their start date: the start of their first employment, an
 * unknown start counting as the earliest.
 */
export const EMPLOYEE_COLUMNS = {
  ...getTableColumns(employees),
  startDate: sql`(${firstEmploymentOf(employees.id, employments.startDate)})`.mapWith(
    employments.startDate,
  ),
};

/** A query for the id, or `column`, of the employee's first employment. */
export function firstEmploymentOf(
  employeeId: string | SQLWrapper,
  column: SQLWrapper = employments.id,
) {
  return sql`select ${column} from ${employments}
    where ${employments.employeeId} = ${employeeId}
    order by ${employments.startDate} nulls first limit 1`;
}
