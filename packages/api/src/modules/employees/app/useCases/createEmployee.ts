import type { SecurityContext } from "../../../../core/security";
import { invalidInput } from "../../../../core/applicationError";
import type { EmployeeRepository } from "../../db";
import {
  EmailTakenError,
  type Employee,
  type NewEmployeeInput,
  parseNewEmployee,
} from "../../domain";

export async function createEmployee(
  employees: EmployeeRepository,
  ctx: SecurityContext,
  input: NewEmployeeInput,
): Promise<Employee> {
  ctx.requireOwnerOrSystem();
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
