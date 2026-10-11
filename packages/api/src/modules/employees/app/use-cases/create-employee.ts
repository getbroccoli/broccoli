import { type Actor, requireOwner } from "../../../../core/actor";
import { invalidInput } from "../../../../core/application-error";
import type { EmployeeRepository } from "../../db";
import {
  EmailTakenError,
  type Employee,
  type NewEmployeeInput,
  parseNewEmployee,
} from "../../domain";

export async function createEmployee(
  employees: EmployeeRepository,
  actor: Actor,
  input: NewEmployeeInput,
): Promise<Employee> {
  requireOwner(actor);
  const newEmployee = parseNewEmployee(input);
  try {
    return await employees.insert(newEmployee);
  } catch (error) {
    if (error instanceof EmailTakenError) {
      throw invalidInput([{ field: "email", code: "taken" }]);
    }
    throw error;
  }
}
