import { ApplicationError } from "../../../../core/applicationError";

export function employeeNotFound(): ApplicationError {
  return new ApplicationError("NOT_FOUND", "No employee has this id.");
}
