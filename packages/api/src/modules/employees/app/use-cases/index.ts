import type { Actor } from "../../../../core/actor";
import type { ModuleDependencies } from "../../../../core/module-manifest";
import { employeeRepository } from "../../db";
import type { NewEmployeeInput } from "../../domain";
import { createEmployee } from "./create-employee";
import { type EmployeeListArgs, listEmployees } from "./list-employees";

/** Everything a user can do with employees; the adapters call nothing else. */
export function createEmployeeUseCases({ orm }: ModuleDependencies) {
  const employees = employeeRepository(orm);
  return {
    createEmployee: (actor: Actor | null, input: NewEmployeeInput) =>
      createEmployee(employees, actor, input),
    listEmployees: (actor: Actor | null, args: EmployeeListArgs) =>
      listEmployees(employees, actor, args),
  };
}

export type EmployeeUseCases = ReturnType<typeof createEmployeeUseCases>;
