import { and, asc, desc, eq, gt, lt, or, type SQL, sql } from "drizzle-orm";

/** One sort column of a keyset order. */
export interface KeysetColumn {
  expression: SQL;
  descending: boolean;
}

/** Sort columns ending with the id; only `keysetOrder` makes one. */
export type KeysetOrder = readonly KeysetColumn[] & { readonly __brand: "KeysetOrder" };

/** A keyset order: the sort columns, then the id, so every row has its own place. */
export function keysetOrder(sort: KeysetColumn[], id: SQL, descending: boolean): KeysetOrder {
  return [...sort, { expression: id, descending }] as unknown as KeysetOrder;
}

/**
 * A nullable text sort column whose empty values come last in both directions: a
 * null flag sorted ascending, then the value with nulls replaced, because a cursor
 * comparison with NULL is never true.
 */
export function nullsLast(text: SQL, descending: boolean): KeysetColumn[] {
  return [
    { expression: sql`${text} is null`, descending: false },
    { expression: sql`coalesce(${text}, '')`, descending },
  ];
}

/** `ORDER BY` for a keyset order. */
export function orderByKeyset(order: KeysetOrder): SQL[] {
  return order.map(({ expression, descending }) =>
    descending ? desc(expression) : asc(expression),
  );
}

/**
 * Rows after the row with `values` in a keyset order. Spelled out column by column
 * (`a > x or (a = x and b > y) …`) because the columns may sort in different directions.
 */
export function afterKeyset(order: KeysetOrder, values: readonly unknown[]): SQL {
  const branches = order.map(({ expression, descending }, index) => {
    const earlierEqual = order
      .slice(0, index)
      .map((earlier, earlierIndex) => eq(earlier.expression, values[earlierIndex]));
    const beyond = descending ? lt(expression, values[index]) : gt(expression, values[index]);
    return and(...earlierEqual, beyond);
  });
  return or(...branches)!;
}
