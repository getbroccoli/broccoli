import type { StoredFile } from "../../../../core/files";
import type { Connection, PageArgs } from "../../../../core/pagination";
import type { HistoryLine } from "../../../../core/records";
import type { SecurityContext } from "../../../../core/security";
import { employeeRepository } from "../../db";
import type { Employee, EmployeeUpdateInput, NewEmployeeInput } from "../../domain";
import { createEmployee } from "./createEmployee";
import { deleteEmployee } from "./deleteEmployee";
import type { EmployeeContext } from "./employeeContext";
import { type EmployeeListArgs, listEmployees } from "./listEmployees";
import { readAvatar } from "./readAvatar";
import { readEmployee, readEmployeeHistory } from "./readEmployee";
import { updateEmployee } from "./updateEmployee";

/** Everything a user can do with employees; the adapters call nothing else. */
export interface EmployeeUseCases {
  createEmployee: (ctx: SecurityContext, input: NewEmployeeInput) => Promise<Employee>;
  /** Changes the fields sent; refuses an unknown id with NOT_FOUND. */
  updateEmployee: (
    ctx: SecurityContext,
    input: EmployeeUpdateInput & { id: string },
  ) => Promise<Employee>;
  /** Removes an employee and returns their id; refuses an unknown id with NOT_FOUND. */
  deleteEmployee: (
    ctx: SecurityContext,
    input: { id: string; changeReason?: string | null },
  ) => Promise<string>;
  /** The employee with this id, or null when there is none. */
  readEmployee: (ctx: SecurityContext, id: string) => Promise<Employee | null>;
  /** An employee's history, newest first, also after the employee is deleted. */
  readEmployeeHistory: (
    ctx: SecurityContext,
    employeeId: string,
    args: PageArgs,
  ) => Promise<Connection<HistoryLine>>;
  listEmployees: (ctx: SecurityContext, args: EmployeeListArgs) => Promise<Connection<Employee>>;
  /** The avatar file with this id, or null when it is no employee's avatar. */
  readAvatar: (ctx: SecurityContext, fileId: string) => Promise<StoredFile | null>;
}

export function createEmployeeUseCases(context: EmployeeContext): EmployeeUseCases {
  const employees = employeeRepository(context.orm);
  return {
    createEmployee: (ctx, input) => createEmployee(context, ctx, input),
    updateEmployee: (ctx, input) => updateEmployee(context, ctx, input),
    deleteEmployee: (ctx, input) => deleteEmployee(context, ctx, input),
    readEmployee: (ctx, id) => readEmployee(employees, ctx, id),
    readEmployeeHistory: (ctx, employeeId, args) =>
      readEmployeeHistory(context, ctx, employeeId, args),
    listEmployees: (ctx, args) => listEmployees(employees, ctx, args),
    readAvatar: (ctx, fileId) => readAvatar({ orm: context.orm, employees }, ctx, fileId),
  };
}
