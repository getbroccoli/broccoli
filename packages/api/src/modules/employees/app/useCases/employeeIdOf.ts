import { z } from "zod";

import { ApplicationError } from "../../../../core/applicationError";

/**
 * The id in the lowercase form Postgres returns, so history keeps one key per employee; null for
 * a malformed one, which names no employee.
 */
export function employeeIdOf(id: string): string | null {
  const parsed = z.uuid().safeParse(id);
  return parsed.success ? parsed.data.toLowerCase() : null;
}

export function employeeNotFound(): ApplicationError {
  return new ApplicationError("NOT_FOUND", "No employee has this id.");
}
