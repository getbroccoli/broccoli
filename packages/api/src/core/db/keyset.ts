import { and, asc, desc, eq, gt, lt, or, type SQL } from "drizzle-orm";

/** One sort column of a keyset order. */
export interface KeysetColumn {
  expression: SQL;
  descending: boolean;
}

/** `ORDER BY` for a keyset order; its last column must be unique, such as the id. */
export function orderByKeyset(columns: readonly KeysetColumn[]): SQL[] {
  return columns.map(({ expression, descending }) =>
    descending ? desc(expression) : asc(expression),
  );
}

/**
 * Rows after the row with `values` in a keyset order. Spelled out column by column
 * (`a > x or (a = x and b > y) …`) because the columns may sort in different directions.
 */
export function afterKeyset(columns: readonly KeysetColumn[], values: readonly unknown[]): SQL {
  const branches = columns.map(({ expression, descending }, index) => {
    const earlierEqual = columns
      .slice(0, index)
      .map((earlier, earlierIndex) => eq(earlier.expression, values[earlierIndex]));
    const beyond = descending ? lt(expression, values[index]) : gt(expression, values[index]);
    return and(...earlierEqual, beyond);
  });
  return or(...branches)!;
}
