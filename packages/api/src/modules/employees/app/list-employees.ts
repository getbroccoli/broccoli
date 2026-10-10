import { type Actor, requireOwner } from "../../../core/actor";
import { invalidInput } from "../../../core/application-error";
import type { Employee } from "../domain/employee";
import { decodeCursor, encodeCursor } from "./cursor";
import type { EmployeeRepository } from "./employee-repository";

export const PAGE_SIZE = { default: 100, max: 10_000 } as const;

export interface EmployeeConnection {
  edges: { cursor: string; node: Employee }[];
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
}

/** Employees in name order, one page at a time. */
export async function listEmployees(
  repository: EmployeeRepository,
  actor: Actor | null,
  { first = PAGE_SIZE.default, after = null }: { first?: number; after?: string | null },
): Promise<EmployeeConnection> {
  requireOwner(actor);
  if (!Number.isInteger(first) || first < 1 || first > PAGE_SIZE.max) {
    throw invalidInput([{ field: "first", code: "out_of_range" }]);
  }
  const keyset = after === null ? null : decodeCursor(after);
  if (after !== null && !keyset) {
    throw invalidInput([{ field: "after", code: "invalid" }]);
  }

  const page = await repository.findPage({ first, after: keyset });
  const edges = page.rows.map(({ employee, keyset }) => ({
    cursor: encodeCursor(keyset),
    node: employee,
  }));
  return {
    edges,
    pageInfo: { hasNextPage: page.hasNextPage, endCursor: edges.at(-1)?.cursor ?? null },
  };
}
