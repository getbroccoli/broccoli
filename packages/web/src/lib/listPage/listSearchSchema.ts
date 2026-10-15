import { z } from "zod";

/** The longest search the API accepts. */
export const SEARCH_MAX_LENGTH = 100;

/**
 * The search params of a list sorted by one of `sortKeys`, the first by default. Each
 * field falls back on its own, so a hand-edited URL still opens a valid list.
 */
export function listSearchSchema<const SortKey extends string>(
  sortKeys: readonly [SortKey, ...SortKey[]],
) {
  return z.object({
    q: z.string().trim().min(1).max(SEARCH_MAX_LENGTH).optional().catch(undefined),
    sort: z.enum(sortKeys).default(sortKeys[0]).catch(sortKeys[0]),
    dir: z.enum(["asc", "desc"]).default("asc").catch("asc"),
    after: z.string().min(1).optional().catch(undefined),
  });
}
