import type { Actor } from "../../../../core/actor";
import type { PageArgs } from "../../../../core/pagination";
import type { ModuleDependencies } from "../../../../core/module-manifest";
import { employeeRepository } from "../../db";
import type { NewEmployeeInput } from "../../domain";
import { createEmployee } from "./create-employee";
import { listEmployees } from "./list-employees";

/** Everything a user can do with employees; the adapters call nothing else. */
export function createEmployeeUseCases({ orm }: ModuleDependencies) {
  const employees = employeeRepository(orm);
  return {
    createEmployee: (actor: Actor | null, input: NewEmployeeInput) =>
      createEmployee(employees, actor, input),
    listEmployees: (actor: Actor | null, page: PageArgs) => listEmployees(employees, actor, page),
  };
}

export type EmployeeUseCases = ReturnType<typeof createEmployeeUseCases>;
