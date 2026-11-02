import { expect } from "vitest";

import type { Orm } from "../../src/core/db";
import type { Connection } from "../../src/core/pagination";
import { type HistoryLine } from "../../src/core/records";
import { OWNER } from "./testSecurityContext";
import { employeeServices } from "./services";
import { recordHistory } from "./statelessServices";

/** Replaying every change must reconstruct the stored employee, or empty fields after deletion. */
export async function expectHistoryReplaysTo(orm: Orm, employeeId: string): Promise<void> {
  const lines: HistoryLine[] = [];
  let after: string | null = null;
  do {
    const page: Connection<HistoryLine> = await recordHistory.read(orm, "employee", employeeId, {
      first: 100,
      after,
    });
    lines.push(...page.edges.map(({ node }) => node));
    after = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
  } while (after !== null);

  const replayed: Record<string, string | null> = {
    firstName: null,
    lastName: null,
    email: null,
    jobTitle: null,
    startDate: null,
    manager: null,
    location: null,
  };
  for (const line of lines.reverse()) {
    for (const change of line.changes) {
      expect(replayed[change.field]).toBe(change.oldValue);
      replayed[change.field] = change.newValue;
    }
  }

  const employees = employeeServices(orm);
  const employee = await employees.readEmployee(OWNER, employeeId);
  const startDates = await employees.readStartDates(OWNER, [employeeId]);
  const managers = await employees.readManagers(OWNER, [employeeId]);
  expect(replayed).toEqual({
    firstName: employee?.firstName ?? null,
    lastName: employee?.lastName ?? null,
    email: employee?.email ?? null,
    jobTitle: employee?.jobTitle ?? null,
    startDate: startDates.get(employeeId) ?? null,
    manager: managers.get(employeeId)?.id ?? null,
    location: employee?.locationId ?? null,
  });
}
