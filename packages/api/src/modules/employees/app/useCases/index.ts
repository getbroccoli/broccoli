import type { Actor } from "../../../../core/actor";
import type { ModuleDependencies } from "../../../../core/moduleManifest";
import { employeeRepository } from "../../db";
import type { NewEmployeeInput } from "../../domain";
import { createEmployee } from "./createEmployee";
import { isEmployeeAvatarFile } from "./isEmployeeAvatarFile";
import { type EmployeeListArgs, listEmployees } from "./listEmployees";

/** Everything a user can do with employees; the adapters call nothing else. */
export function createEmployeeUseCases({ orm }: Pick<ModuleDependencies, "orm">) {
  const employees = employeeRepository(orm);
  return {
    createEmployee: (actor: Actor, input: NewEmployeeInput) =>
      createEmployee(employees, actor, input),
    listEmployees: (actor: Actor, args: EmployeeListArgs) => listEmployees(employees, actor, args),
    isEmployeeAvatarFile: (actor: Actor, fileId: string) =>
      isEmployeeAvatarFile(employees, actor, fileId),
  };
}

export type EmployeeUseCases = ReturnType<typeof createEmployeeUseCases>;
