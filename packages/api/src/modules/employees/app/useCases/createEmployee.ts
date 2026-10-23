import type { SecurityContext } from "../../../../core/security";
import { invalidInput } from "../../../../core/applicationError";
import { employeeRepository } from "../../db";
import {
  EmailTakenError,
  type Employee,
  type NewEmployeeInput,
  parseNewEmployee,
} from "../../domain";
import { recordCreatedEmployees } from "../recordCreatedEmployees";
import type { EmployeeContext } from "./employeeContext";

export async function createEmployee(
  { transact }: EmployeeContext,
  ctx: SecurityContext,
  input: NewEmployeeInput,
): Promise<Employee> {
  ctx.requireOwnerOrSystem();
  const newEmployee = parseNewEmployee(input);
  try {
    return await transact(async (tx) => {
      const employee = await employeeRepository(tx).insert(newEmployee);
      await recordCreatedEmployees(ctx, tx, [employee], { kind: "EDITED_DIRECTLY" });
      return employee;
    });
  } catch (error) {
    if (error instanceof EmailTakenError) {
      throw invalidInput([{ field: "email", code: "taken" }]);
    }
    throw error;
  }
}
