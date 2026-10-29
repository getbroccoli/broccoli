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
import { readableResult } from "./readableResult";

export async function createEmployee(
  { transact }: EmployeeContext,
  ctx: SecurityContext,
  input: NewEmployeeInput,
): Promise<Employee | null> {
  ctx.requireEveryRecord("employee", "create");
  const newEmployee = parseNewEmployee(input);
  try {
    const employee = await transact(async (tx) => {
      const employee = await employeeRepository(tx).insert(newEmployee);
      await recordCreatedEmployees(ctx, tx, [employee], { kind: "EDITED_DIRECTLY" });
      return employee;
    });
    return (await readableResult(ctx, employee, null)).employee;
  } catch (error) {
    if (error instanceof EmailTakenError) {
      throw invalidInput([{ field: "email", code: "taken" }]);
    }
    throw error;
  }
}
