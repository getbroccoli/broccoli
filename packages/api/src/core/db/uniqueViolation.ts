import { DrizzleQueryError } from "drizzle-orm";
import { DatabaseError } from "pg";

const UNIQUE_VIOLATION = "23505";
const FOREIGN_KEY_VIOLATION = "23503";
// A NUL in text (22021) or in JSON (22P05): Postgres stores neither.
const UNSTORABLE_CHARACTER = new Set(["22021", "22P05"]);

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

/** True when `error` (a node-postgres error, possibly wrapped by Drizzle) is a foreign key violation. */
export function isForeignKeyViolation(error: unknown): boolean {
  const cause = error instanceof DrizzleQueryError ? error.cause : error;
  return cause instanceof DatabaseError && cause.code === FOREIGN_KEY_VIOLATION;
}

/** True when `error` (a node-postgres error, possibly wrapped by Drizzle) is text Postgres cannot store. */
export function isUnstorableText(error: unknown): boolean {
  const cause = error instanceof DrizzleQueryError ? error.cause : error;
  return cause instanceof DatabaseError && UNSTORABLE_CHARACTER.has(cause.code ?? "");
}
