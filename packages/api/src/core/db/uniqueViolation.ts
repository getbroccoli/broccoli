import { DrizzleQueryError } from "drizzle-orm";
import { DatabaseError } from "pg";

const UNIQUE_VIOLATION = "23505";

/**
 * True when `error` (a node-postgres error, possibly wrapped by Drizzle) is a unique
 * violation of `constraint`, so a repository can turn it into a domain error.
 */
export function isUniqueViolation(error: unknown, constraint: string): boolean {
  const cause = error instanceof DrizzleQueryError ? error.cause : error;
  return (
    cause instanceof DatabaseError &&
    cause.code === UNIQUE_VIOLATION &&
    cause.constraint === constraint
  );
}
