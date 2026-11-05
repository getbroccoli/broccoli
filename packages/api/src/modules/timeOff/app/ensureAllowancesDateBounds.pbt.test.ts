import fc from "fast-check";

import {
  allowanceIdentitySums,
  allowanceSnapshot,
  calendarDate,
  employeeServices,
  expect,
  linkStatutoryMinimumToDefaultTerms,
  OWNER,
  test,
} from "#test/support";

import { addDays } from "../../../utils";

test("invariant: cross-year start corrections keep every line within its allowance year", async ({
  orm,
  seed,
  transact,
}) => {
  await linkStatutoryMinimumToDefaultTerms(orm, seed, transact);
  const employees = employeeServices(orm);

  await fc.assert(
    fc.asyncProperty(
      fc.integer({ min: 0, max: 364 }),
      fc.integer({ min: 365, max: 1095 }),
      async (aOffset, bOffset) => {
        const a = addDays(calendarDate("2026-01-01"), aOffset);
        const b = addDays(calendarDate("2026-01-01"), bOffset);
        const employee = await seed.employee();
        let original: Awaited<ReturnType<typeof allowanceSnapshot>> = [];
        let previous: Awaited<ReturnType<typeof allowanceSnapshot>> = [];
        for (const [index, startDate] of [a, b, a].entries()) {
          await employees.updateEmployee(OWNER, { id: employee.id, startDate });
          const current = await allowanceSnapshot(orm, employee.id);
          expect(current.length).toBeGreaterThan(0);
          if (index === 0) {
            expect(current).toHaveLength(1);
            expect(current[0]!.lines.length).toBeGreaterThan(0);
            original = current;
          }
          // The spec explicitly clamps correction dates into the allowance's retained year.
          for (const { allowance, lines } of current) {
            for (const line of lines) {
              expect(
                line.effectiveDate >= allowance.leaveYearStart,
                `${line.kind} dated ${line.effectiveDate} precedes ${allowance.leaveYearStart}`,
              ).toBe(true);
              expect(
                line.effectiveDate <= allowance.leaveYearEnd,
                `${line.kind} dated ${line.effectiveDate} follows ${allowance.leaveYearEnd}`,
              ).toBe(true);
            }
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
        for (const before of original) {
          const restored = previous.find(({ allowance }) => allowance.id === before.allowance.id)!;
          expect(allowanceIdentitySums(restored.lines)).toEqual(
            allowanceIdentitySums(before.lines),
          );
        }
      },
    ),
    { numRuns: 20, seed: 209202605 },
  );
});
