import { type Column, inArray, type SQL, sql } from "drizzle-orm";

import { ApplicationError } from "../applicationError";
import type { RecordScope, Subject } from "./permissions";

/** Whether the scope reaches the record of this subject. */
export function isInRecordScope(scope: RecordScope, subject: Subject): boolean {
  return scope === "all" || (scope !== "none" && scope.includes(subject));
}

/**
 * The condition a list query adds before paging, so search, order and cursor see only records in
 * scope; refuses with FORBIDDEN a caller with no grant for the action.
 */
export function inRecordScope(scope: RecordScope, subjectColumn: Column): SQL {
  if (scope === "none") {
    throw new ApplicationError("FORBIDDEN", "You are not allowed to do this.");
  }
  // shortcut: no record type has public records yet; the first one adds `subject is null or …`.
  return scope === "all"
    ? sql`true`
    : inArray(
        subjectColumn,
        scope.filter((subject) => subject !== "public"),
      );
}
