import type { StoredFile } from "../../../../core/files";
import type { Connection, PageArgs } from "../../../../core/pagination";
import type { HistoryLine } from "../../../../core/records";
import type { PermissionProfile, SecurityContext } from "../../../../core/security";
import { employeeRepository, employmentRepository } from "../../db";
import type { Employee, EmployeeUpdateInput, NewEmployeeInput } from "../../domain";
import { createEmployee } from "./createEmployee";
import { deleteEmployee } from "./deleteEmployee";
import type { EmployeeContext } from "./employeeContext";
import { type EmployeeListArgs, listEmployees } from "./listEmployees";
import { readPermissionProfiles, setPermissionProfiles } from "./permissionProfiles";
import { readAvatar } from "./readAvatar";
import { readEmployee, readEmployeeHistory, readManagers, readMyEmployee } from "./readEmployee";
import { updateEmployee } from "./updateEmployee";

/** Everything a user can do with employees; the adapters call nothing else. */
export interface EmployeeUseCases {
  createEmployee: (ctx: SecurityContext, input: NewEmployeeInput) => Promise<Employee>;
  /** Changes the fields sent; refuses an unknown id with NOT_FOUND. */
  updateEmployee: (
    ctx: SecurityContext,
    input: EmployeeUpdateInput & { id: string },
  ) => Promise<{ employee: Employee; historyLine: HistoryLine | null }>;
  /**
   * Removes an employee and returns their id and the lines it added to their reports' history;
   * refuses an unknown id with NOT_FOUND.
   */
  deleteEmployee: (
    ctx: SecurityContext,
    input: { id: string; changeReason?: string | null },
  ) => Promise<{ deletedEmployeeId: string; reportHistoryLines: HistoryLine[] }>;
  /** The employee with this id, or null when there is none. */
  readEmployee: (ctx: SecurityContext, id: string) => Promise<Employee | null>;
  /** The signed-in user's own employee; null for a user without one, such as the owner. */
  readMyEmployee: (ctx: SecurityContext) => Promise<Employee | null>;
  /** Each employee's manager today, by the id asked for; employees without one are left out. */
  readManagers: (
    ctx: SecurityContext,
    employeeIds: readonly string[],
  ) => Promise<Map<string, Employee>>;
  /** An employee's history, newest first, also after the employee is deleted. */
  readEmployeeHistory: (
    ctx: SecurityContext,
    employeeId: string,
    args: PageArgs,
  ) => Promise<Connection<HistoryLine>>;
  listEmployees: (ctx: SecurityContext, args: EmployeeListArgs) => Promise<Connection<Employee>>;
  /** The avatar file with this id, or null when it is no employee's avatar. */
  readAvatar: (ctx: SecurityContext, fileId: string) => Promise<StoredFile | null>;
  /**
   * Replaces the profiles given to the user an employee signs in as; refuses an unknown id with
   * NOT_FOUND, an employee without a user, and the owner.
   */
  setPermissionProfiles: (
    ctx: SecurityContext,
    input: { id: string; profiles: readonly PermissionProfile[]; changeReason?: string | null },
  ) => Promise<{ employee: Employee; historyLine: HistoryLine | null }>;
  /** The profiles of each employee's user, by employee id; employees without a user are left out. */
  readPermissionProfiles: (
    ctx: SecurityContext,
    employeeIds: readonly string[],
  ) => Promise<Map<string, PermissionProfile[]>>;
}

export function createEmployeeUseCases(context: EmployeeContext): EmployeeUseCases {
  const employees = employeeRepository(context.orm);
  const employments = employmentRepository(context.orm);
  return {
    createEmployee: (ctx, input) => createEmployee(context, ctx, input),
    updateEmployee: (ctx, input) => updateEmployee(context, ctx, input),
    deleteEmployee: (ctx, input) => deleteEmployee(context, ctx, input),
    readEmployee: (ctx, id) => readEmployee(employees, ctx, id),
    readMyEmployee: (ctx) => readMyEmployee(employees, ctx),
    readManagers: (ctx, employeeIds) => readManagers({ employees, employments }, ctx, employeeIds),
    readEmployeeHistory: (ctx, employeeId, args) =>
      readEmployeeHistory(context, ctx, employeeId, args),
    listEmployees: (ctx, args) => listEmployees(employees, ctx, args),
    readAvatar: (ctx, fileId) => readAvatar({ orm: context.orm, employees }, ctx, fileId),
    setPermissionProfiles: (ctx, input) => setPermissionProfiles(context, ctx, input),
    readPermissionProfiles: (ctx, employeeIds) =>
      readPermissionProfiles(context.orm, ctx, employeeIds),
  };
}
