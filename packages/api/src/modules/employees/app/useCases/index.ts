import type { StoredFile } from "../../../../core/files";
import type { SecurityContext } from "../../../../core/security";
import type { ModuleDependencies } from "../../../../core/moduleManifest";
import { employeeRepository } from "../../db";
import type { Employee, NewEmployeeInput } from "../../domain";
import type { Connection } from "../../../../core/pagination";
import { createEmployee } from "./createEmployee";
import { type EmployeeListArgs, listEmployees } from "./listEmployees";
import { readAvatar } from "./readAvatar";

/** Everything a user can do with employees; the adapters call nothing else. */
export interface EmployeeUseCases {
  createEmployee: (ctx: SecurityContext, input: NewEmployeeInput) => Promise<Employee>;
  listEmployees: (ctx: SecurityContext, args: EmployeeListArgs) => Promise<Connection<Employee>>;
  /** The avatar file with this id, or null when it is no employee's avatar. */
  readAvatar: (ctx: SecurityContext, fileId: string) => Promise<StoredFile | null>;
}

export function createEmployeeUseCases({ orm }: Pick<ModuleDependencies, "orm">): EmployeeUseCases {
  const employees = employeeRepository(orm);
  return {
    createEmployee: (ctx: SecurityContext, input: NewEmployeeInput) =>
      createEmployee(employees, ctx, input),
    listEmployees: (ctx: SecurityContext, args: EmployeeListArgs) =>
      listEmployees(employees, ctx, args),
    readAvatar: (ctx: SecurityContext, fileId: string) =>
      readAvatar({ orm, employees }, ctx, fileId),
  };
}
