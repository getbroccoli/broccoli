import type { z } from "zod";

import { invalidInput } from "../applicationError";

export const PAGE_SIZE = { default: 100, max: 10_000 } as const;

const SEARCH_MAX_LENGTH = 100;

/** Relay page arguments as a client sends them. */
export interface PageArgs {
  first?: number;
  after?: string | null;
}

/** One page of a Relay connection. */
export interface Connection<T> {
  edges: { cursor: string; node: T }[];
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
}

/**
 * Checks page arguments and decodes `after` into the list's keyset: the sort values
 * of the last row already seen.
 */
export function parsePage<K>(
  { first = PAGE_SIZE.default, after = null }: PageArgs,
  keyset: z.ZodType<K>,
): { first: number; after: K | null } {
  if (!Number.isInteger(first) || first < 1 || first > PAGE_SIZE.max) {
    throw invalidInput([{ field: "first", code: "out_of_range" }]);
  }
  if (after === null) {
    return { first, after: null };
  }
  const decoded = keyset.safeParse(decodeCursor(after));
  if (!decoded.success) {
    throw invalidInput([{ field: "after", code: "invalid" }]);
  }
  return { first, after: decoded.data };
}

/** `rows` holds up to `first + 1` rows; the extra row only signals a next page. */
export function toConnection<T, K>(rows: { node: T; keyset: K }[], first: number): Connection<T> {
  const edges = rows
    .slice(0, first)
    .map(({ node, keyset }) => ({ cursor: encodeCursor(keyset), node }));
  return {
    edges,
    pageInfo: { hasNextPage: rows.length > first, endCursor: edges.at(-1)?.cursor ?? null },
  };
}

/** An opaque cursor: the keyset as base64url JSON. */
function encodeCursor(keyset: unknown): string {
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

/** A list's search text, trimmed, or null when blank; refused over 100 characters. */
export function parseSearch(search: string | null | undefined): string | null {
  const trimmed = search?.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.length > SEARCH_MAX_LENGTH) {
    throw invalidInput([{ field: "search", code: "too_long" }]);
  }
  return trimmed;
}
