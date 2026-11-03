import Big from "big.js";
import fc from "fast-check";

import {
  allowanceSnapshot,
  calendarDate,
  employeeServices,
  expect,
  linkStatutoryMinimumToEnglandAndWales,
  OWNER,
  test,
} from "#test/support";

import { addDays } from "../../../utils";

for (const scenario of [
  {
    name: "every generated cutoff",
    dates: fc.integer({ min: 7, max: 364 }).map((b) => ({ b, cutoff: b - 1 })),
    numRuns: 20,
  },
  {
    name: "June 1 after correcting a December 1 start back to January 1",
    dates: fc.constant({ b: 334, cutoff: 151 }),
    numRuns: 1,
  },
]) {
  test(`invariant: a restored start date restores the ledger balance at ${scenario.name}`, async ({
    orm,
    seed,
    transact,
  }) => {
    await linkStatutoryMinimumToEnglandAndWales(orm, seed, transact);
    const employees = employeeServices(orm);
    const a = calendarDate("2026-01-01");

    await fc.assert(
      fc.asyncProperty(scenario.dates, async ({ b, cutoff }) => {
        const employee = await seed.employee();
        await employees.updateEmployee(OWNER, { id: employee.id, startDate: a });
        const original = await allowanceSnapshot(orm, employee.id);
        expect(original).toHaveLength(1);
        expect(original[0]!.lines.length).toBeGreaterThan(0);

        for (const startDate of [addDays(a, b), a]) {
          await employees.updateEmployee(OWNER, { id: employee.id, startDate });
        }
        const restored = await allowanceSnapshot(orm, employee.id);
        expect(restored).toHaveLength(1);
        // An unchanged annual total must not conceal a different balance earlier in the year.
        expect(balanceThrough(restored[0]!.lines, calendarDate("2026-12-31"))).toBe(
          balanceThrough(original[0]!.lines, calendarDate("2026-12-31")),
        );
        const through = addDays(a, cutoff);
        expect(balanceThrough(restored[0]!.lines, through)).toBe(
          balanceThrough(original[0]!.lines, through),
        );
      }),
      { numRuns: scenario.numRuns, seed: 209202604 },
    );
  });
}

function balanceThrough(
  lines: Awaited<ReturnType<typeof allowanceSnapshot>>[number]["lines"],
  through: string,
) {
  return lines
    .filter(({ effectiveDate }) => effectiveDate <= through)
    .reduce((sum, line) => sum.plus(line.amount), Big(0))
    .toString();
}
