import { ilike, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";

import { containsPattern, keysetOrder, type KeysetOrder, nullsLast } from "../../../core/db";
import type { EmployeeOrder } from "../../employees";
import { importRecords } from "./importRecordsTable";

/** The sort values of the last record seen, as Postgres computed them, behind the order they belong to. */
export type ImportEmployeeKeyset = [field: string, direction: string, ...values: unknown[]];

const KEYSET_VALUES = {
  NAME: [z.string(), z.string(), z.uuid()],
  EMAIL: [z.boolean(), z.string(), z.uuid()],
  START_DATE: [z.boolean(), z.string(), z.uuid()],
} as const;

/** Parses the keyset of a cursor; a cursor from another order does not match. */
export function importEmployeeKeyset({
  field,
  direction,
}: EmployeeOrder): z.ZodType<ImportEmployeeKeyset> {
  return z.tuple([z.literal(field), z.literal(direction), ...KEYSET_VALUES[field]]);
}

/** The keyset order of the records in `order`. */
export function importEmployeeOrderColumns({ field, direction }: EmployeeOrder): KeysetOrder {
  const descending = direction === "DESC";
  const id = sql`${importRecords.id}`;
  switch (field) {
    case "NAME":
      return keysetOrder(
        [
          { expression: sql`lower(coalesce(${valueOf("firstName")}, ''))`, descending },
          { expression: sql`lower(coalesce(${valueOf("lastName")}, ''))`, descending },
        ],
        id,
        descending,
      );
    case "EMAIL":
      return keysetOrder(nullsLast(valueOf("email"), descending), id, descending);
    case "START_DATE":
      // Stored as ISO text, which sorts like the date.
      return keysetOrder(nullsLast(valueOf("startDate"), descending), id, descending);
  }
}

/** Records whose first name, last name or email contains `search`, ignoring case. */
export function matchesSearch(search: string): SQL {
  const pattern = containsPattern(search);
  return or(
    ilike(valueOf("firstName"), pattern),
    ilike(valueOf("lastName"), pattern),
    ilike(valueOf("email"), pattern),
  )!;
}

/** A field of the record's `values`, as text. */
function valueOf(field: string): SQL<string | null> {
  return sql<string | null>`${importRecords.values}->>${field}`;
}
