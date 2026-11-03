import fc from "fast-check";

import {
  allowanceIdentitySums,
  allowanceSnapshot,
  calendarDate,
  employeeServices,
  expect,
  linkStatutoryMinimumToEnglandAndWales,
  OWNER,
  test,
} from "#test/support";

import { addDays } from "../../../utils";

test("invariant: reversing a start-date correction restores each dated ledger identity", async ({
  orm,
  seed,
  transact,
}) => {
  await linkStatutoryMinimumToEnglandAndWales(orm, seed, transact);
  const employees = employeeServices(orm);

  await fc.assert(
    fc.asyncProperty(distinctStartDays(), async ([a, b]) => {
      const employee = await seed.employee();
      let original: Awaited<ReturnType<typeof allowanceSnapshot>> = [];
      let previous: Awaited<ReturnType<typeof allowanceSnapshot>> = [];
      // The earliest changed employment day is the same in either direction of a correction.
      for (const [index, startDate] of [a, b, a].entries()) {
        await employees.updateEmployee(OWNER, { id: employee.id, startDate });
        const current = await allowanceSnapshot(orm, employee.id);
        expect(current).toHaveLength(1);
        if (index === 0) {
          expect(current[0]!.lines.length).toBeGreaterThan(0);
          original = current;
        }
        for (const earlier of previous) {
          const after = current.find(({ allowance }) => allowance.id === earlier.allowance.id)!;
          expect(after.allowance).toEqual(earlier.allowance);
          for (const line of earlier.lines) {
            expect(after.lines.find(({ id }) => id === line.id)).toEqual(line);
          }
        }
        previous = current;
      }

      // Opposite grant corrections must cancel on their effective date, not only for the year.
      expect(datedIdentitySums(previous[0]!.lines)).toEqual(datedIdentitySums(original[0]!.lines));
    }),
    { numRuns: 20, seed: 209202603 },
  );
});

function distinctStartDays() {
  return fc
    .oneof(
      fc.constantFrom([0, 1], [91, 92], [92, 93], [357, 358]),
      fc
        .tuple(fc.integer({ min: 0, max: 364 }), fc.integer({ min: 1, max: 364 }))
        .map(([start, change]) => [start, (start + change) % 365]),
    )
    .map(
      ([a, b]) =>
        [addDays(calendarDate("2026-01-01"), a), addDays(calendarDate("2026-01-01"), b)] as const,
    );
}

function datedIdentitySums(lines: Awaited<ReturnType<typeof allowanceSnapshot>>[number]["lines"]) {
  return [...new Set(lines.map(({ effectiveDate }) => effectiveDate))]
    .sort()
    .map((date) => ({
      date,
      sums: allowanceIdentitySums(lines.filter((line) => line.effectiveDate === date)),
    }))
    .filter(({ sums }) => sums.length > 0);
}
