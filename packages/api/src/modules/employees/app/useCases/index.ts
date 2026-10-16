import type { SecurityContext } from "../../../../core/security";
import type { ModuleDependencies } from "../../../../core/moduleManifest";
import { employeeRepository } from "../../db";
import type { Employee, NewEmployeeInput } from "../../domain";
import type { Connection } from "../../../../core/pagination";
import { createEmployee } from "./createEmployee";
import { isEmployeeAvatarFile } from "./isEmployeeAvatarFile";
import { type EmployeeListArgs, listEmployees } from "./listEmployees";

/** Everything a user can do with employees; the adapters call nothing else. */
export interface EmployeeUseCases {
  createEmployee: (ctx: SecurityContext, input: NewEmployeeInput) => Promise<Employee>;
  listEmployees: (ctx: SecurityContext, args: EmployeeListArgs) => Promise<Connection<Employee>>;
  isEmployeeAvatarFile: (ctx: SecurityContext, fileId: string) => Promise<boolean>;
}

export function createEmployeeUseCases({ orm }: Pick<ModuleDependencies, "orm">): EmployeeUseCases {
  const employees = employeeRepository(orm);
  return {
    createEmployee: (ctx: SecurityContext, input: NewEmployeeInput) =>
      createEmployee(employees, ctx, input),
    listEmployees: (ctx: SecurityContext, args: EmployeeListArgs) =>
      listEmployees(employees, ctx, args),
    isEmployeeAvatarFile: (ctx: SecurityContext, fileId: string) =>
      isEmployeeAvatarFile(employees, ctx, fileId),
  };
}
