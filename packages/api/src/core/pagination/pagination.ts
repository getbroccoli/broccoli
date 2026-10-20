import type { z } from "zod";

import { invalidInput } from "../applicationError";

/** How a list is sorted: by one of its fields, then by id. */
export interface ListOrder<Field extends string> {
  field: Field;
  direction: "ASC" | "DESC";
}

/** A list's `orderBy` argument as a client sends it; the direction defaults to ascending. */
export type OrderArg<Field extends string> =
  { field: Field; direction?: ListOrder<Field>["direction"] | null } | null | undefined;

/** Relay page arguments as a client sends them. */
export interface PageArgs {
  first?: number;
  after?: string | null;
}

/** A list's page and order arguments as a client sends them. */
export interface ListArgs<Field extends string> extends PageArgs {
  orderBy?: OrderArg<Field>;
}

/** What a list asks its source for: up to `limit` rows after the row with sort values `after`, in `order`. */
export interface KeysetQuery<Field extends string, Values> {
  order: ListOrder<Field>;
  after: Values | null;
  limit: number;
}

/** A row and its sort values, the id last. */
export interface KeysetRow<T, Values> {
  node: T;
  values: Values;
}

/** How `paginate` reads one list. */
export interface KeysetList<Field extends string, Values, Rows> {
  /** The order when the client sends none; the fields come from `keysetValues`. */
  order: ListOrder<NoInfer<Field>>;
  /** The sort values of a row in each order, the id last. */
  keysetValues: Record<Field, z.ZodType<Values>>;
  fetch: (query: KeysetQuery<Field, Values>) => Rows;
}

/** One page of a Relay connection. */
export interface Connection<T> {
  edges: { cursor: string; node: T }[];
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
}

/**
 * One page of a list over a keyset query. It checks the arguments, asks `fetch` for one
 * row more than the page to learn whether a next page exists, and puts the order in each
 * cursor, so a cursor from another order is refused.
 */
export function paginate<Field extends string, Values extends readonly unknown[], T>(
  args: ListArgs<NoInfer<Field>>,
  list: KeysetList<Field, Values, Promise<KeysetRow<T, Values>[]>>,
): Promise<Connection<T>>;
export function paginate<Field extends string, Values extends readonly unknown[], T>(
  args: ListArgs<NoInfer<Field>>,
  list: KeysetList<Field, Values, KeysetRow<T, Values>[]>,
): Connection<T>;
export function paginate<Field extends string, Values extends readonly unknown[], T>(
  { first = PAGE_SIZE.default, after = null, orderBy }: ListArgs<Field>,
  { order: defaultOrder, keysetValues, fetch }: KeysetList<Field, Values, Rows<T, Values>>,
): Connection<T> | Promise<Connection<T>> {
  if (!Number.isInteger(first) || first < 1 || first > PAGE_SIZE.max) {
    throw invalidInput([{ field: "first", code: "out_of_range" }]);
  }
  const order = orderBy
    ? { field: orderBy.field, direction: orderBy.direction ?? "ASC" }
    : defaultOrder;
  const afterValues = after === null ? null : parseCursor(after, order, keysetValues[order.field]);
  const toConnection = (rows: KeysetRow<T, Values>[]) => connection(rows, first, order);
  const rows = fetch({ order, after: afterValues, limit: first + 1 });
  // An in-memory list pages synchronously; a database list awaits its rows.
  return rows instanceof Promise ? rows.then(toConnection) : toConnection(rows);
}

const PAGE_SIZE = { default: 100, max: 10_000 } as const;

type Rows<T, Values> = KeysetRow<T, Values>[] | Promise<KeysetRow<T, Values>[]>;

/** The sort values in a cursor of `order`; refuses one this API did not issue for that order. */
function parseCursor<Field extends string, Values>(
  cursor: string,
  { field, direction }: ListOrder<Field>,
  values: z.ZodType<Values>,
): Values {
  const decoded = decodeCursor(cursor);
  const parsed =
    Array.isArray(decoded) && decoded[0] === field && decoded[1] === direction
      ? values.safeParse(decoded.slice(2))
      : undefined;
  if (!parsed?.success) {
    throw invalidInput([{ field: "after", code: "invalid" }]);
  }
  return parsed.data;
}

/** `rows` holds up to `first + 1` rows; the extra row only signals a next page. */
function connection<T, Field extends string>(
  rows: KeysetRow<T, readonly unknown[]>[],
  first: number,
  { field, direction }: ListOrder<Field>,
): Connection<T> {
  const edges = rows.slice(0, first).map(({ node, values }) => ({
    cursor: encodeCursor([field, direction, ...values]),
    node,
  }));
  return {
    edges,
    pageInfo: { hasNextPage: rows.length > first, endCursor: edges.at(-1)?.cursor ?? null },
  };
}

/** An opaque cursor: the order and the sort values as base64url JSON. */
function encodeCursor(keyset: unknown[]): string {
  return Buffer.from(JSON.stringify(keyset)).toString("base64url");
}

/** The cursor's content, or undefined when it is not one this API issued. */
function decodeCursor(cursor: string): unknown {
  try {
    return JSON.parse(Buffer.from(cursor, "base64url").toString());
  } catch {
    return undefined;
  }
}
