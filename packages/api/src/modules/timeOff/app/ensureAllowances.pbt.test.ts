import fc from "fast-check";

import {
  calendarDate,
  employeeServices,
  expect,
  linkStatutoryMinimumToDefaultTerms,
  OWNER,
  readAllowances,
  test,
  timeOffService,
  workingPatternService,
  transactWithTimeOffEvents,
} from "#test/support";

import { addDays } from "../../../utils";

test("invariant: ensuring unchanged inputs appends nothing", async ({ orm, seed, transact }) => {
  await linkStatutoryMinimumToDefaultTerms(orm, seed, transact);
  const service = timeOffService(orm);
  await fc.assert(
    fc.asyncProperty(startDate(), async (startDate) => {
      const employee = await seed.employee({ startDate });
      const input = {
        employeeIds: [employee.id],
        cause: { kind: "DAILY_CHECK" as const, ref: "2026-06-01" },
      };
      await transact((tx) => service.ensureAllowances(OWNER, tx, input));
      const before = await readAllowances(orm, employee.id);
      expect(before).toHaveLength(1);

      await transact((tx) => service.ensureAllowances(OWNER, tx, input));
      expect(await readAllowances(orm, employee.id)).toEqual(before);
    }),
    { numRuns: 12, seed: 2092026 },
  );
});

test("invariant: start-date corrections preserve every earlier ledger line", async ({
  orm,
  seed,
  transact,
}) => {
  await linkStatutoryMinimumToDefaultTerms(orm, seed, transact);
  const employees = employeeServices(orm);
  await fc.assert(
    fc.asyncProperty(fc.array(startDate(), { minLength: 2, maxLength: 5 }), async (dates) => {
      const employee = await seed.employee();
      let before: Awaited<ReturnType<typeof readAllowances>> = [];
      for (const startDate of dates) {
        await employees.updateEmployee(OWNER, { id: employee.id, startDate });
        const after = await readAllowances(orm, employee.id);
        expect(after.length).toBeGreaterThan(0);
        expect(after.some(({ lines }) => lines.length > 0)).toBe(true);
        for (const allowance of before) {
          const current = after.find((row) => row.leaveYearStart === allowance.leaveYearStart)!;
          expect(current).toBeDefined();
          expect(current.lines.slice(0, allowance.lines.length)).toEqual(allowance.lines);
        }
        before = after;
      }
    }),
    { numRuns: 12, seed: 2092026 },
  );
});

test("invariant: corrected starts and patterns converge with a fresh person's final inputs", async ({
  orm,
  seed,
  transact,
}) => {
  await linkStatutoryMinimumToDefaultTerms(orm, seed, transact);
  const employees = employeeServices(orm);
  const patterns = workingPatternService(orm, { transact: transactWithTimeOffEvents(orm) });
  await fc.assert(
    // Correct the same assignment date, so the final dated pattern really is identical.
    fc.asyncProperty(
      fc.array(fc.record({ startDate: startDate(), workingDays: fc.integer({ min: 1, max: 7 }) }), {
        minLength: 2,
        maxLength: 4,
      }),
      async (changes) => {
        const employee = await seed.employee({ startDate: changes[0]!.startDate });
        let finalPatternId = "";
        for (const [index, change] of changes.entries()) {
          const pattern = await patterns.createPattern(OWNER, {
            name: `${employee.id}-${index}`,
            minutes: [0, 1, 2, 3, 4, 5, 6].map((day) => (day < change.workingDays ? 450 : 0)) as [
              number,
              number,
              number,
              number,
              number,
              number,
              number,
            ],
            fullDayMinutes: 450,
            bankHolidayCalendar: "england_and_wales",
          });
          finalPatternId = pattern.id;
          await employees.updateEmployee(OWNER, { id: employee.id, startDate: change.startDate });
          await patterns.assignPattern(OWNER, {
            employeeId: employee.id,
            workingPatternId: pattern.id,
            effectiveFrom: calendarDate("2025-01-01"),
            effectiveUntil: null,
          });
        }
        const final = changes.at(-1)!;
        const fresh = await seed.employee({ startDate: final.startDate });
        await patterns.assignPattern(OWNER, {
          employeeId: fresh.id,
          workingPatternId: finalPatternId,
          effectiveFrom: calendarDate("2025-01-01"),
          effectiveUntil: null,
        });
        const expected = await readAllowances(orm, fresh.id);
        const actual = await readAllowances(orm, employee.id);
        expect(expected).toHaveLength(1);
        expect(expected[0]!.lines.length).toBeGreaterThan(0);
        // Moving a start into a later year leaves zero history in the earlier year.
        const sameYear = actual.find((row) => row.leaveYearStart === expected[0]!.leaveYearStart)!;
        expect(sameYear).toBeDefined();
        expect(sameYear.total).toBe(expected[0]!.total);
      },
    ),
    { numRuns: 12, seed: 2092026 },
  );
});

test("invariant: concurrent ensures write the same ledger as one ensure", async ({
  orm,
  seed,
  transact,
}) => {
  await linkStatutoryMinimumToDefaultTerms(orm, seed, transact);
  const service = timeOffService(orm);
  await fc.assert(
    fc.asyncProperty(startDate(), fc.integer({ min: 2, max: 4 }), async (startDate, contenders) => {
      const concurrent = await seed.employee({ startDate });
      const sequential = await seed.employee({ startDate });
      const cause = { kind: "DAILY_CHECK" as const, ref: "2026-06-01" };
      // Independent committed transactions contend for an allowance that does not yet exist.
      await Promise.all(
        Array.from({ length: contenders }, () =>
          transact((tx) =>
            service.ensureAllowances(OWNER, tx, { employeeIds: [concurrent.id], cause }),
          ),
        ),
      );
      await transact((tx) =>
        service.ensureAllowances(OWNER, tx, { employeeIds: [sequential.id], cause }),
      );

      expect(await readAllowances(orm, concurrent.id)).toEqual(
        await readAllowances(orm, sequential.id),
      );
    }),
    { numRuns: 12, seed: 2092026 },
  );
});

function startDate() {
  // Past, current-year and future starters exercise both recalculation and year creation.
  return fc
    .integer({ min: -365, max: 729 })
    .map((offset) => addDays(calendarDate("2026-01-01"), offset));
}
