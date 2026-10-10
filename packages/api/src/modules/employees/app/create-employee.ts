import { type Actor, requireOwner } from "../../../core/actor";
import { invalidInput } from "../../../core/application-error";
import { type Employee, type NewEmployeeInput, parseNewEmployee } from "../domain/employee";
import { EmailTakenError, type EmployeeRepository } from "./employee-repository";

export async function createEmployee(
  repository: EmployeeRepository,
  actor: Actor | null,
  input: NewEmployeeInput,
): Promise<Employee> {
  requireOwner(actor);
  const newEmployee = parseNewEmployee(input);
  try {
    return await repository.insert(newEmployee);
  } catch (error) {
    if (error instanceof EmailTakenError) {
      throw invalidInput([{ field: "email", code: "taken" }]);
    }
    throw error;
  }
}
