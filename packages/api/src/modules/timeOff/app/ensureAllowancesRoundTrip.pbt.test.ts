import fc from "fast-check";

import {
  allowanceSnapshot,
  allowanceIdentitySums,
  calendarDate,
  employeeServices,
  expect,
  OWNER,
  test,
  timeOffService,
  workingPatternService,
} from "#test/support";

import { addDays } from "../../../utils";

for (const policyKey of [
  "uk_statutory_minimum",
  "uk_20_days_plus_bank_holidays",
  "uk_25_days_plus_bank_holidays",
]) {
  test(`invariant: A to B to A restores every original ledger identity (${policyKey})`, async ({
    orm,
    seed,
    transact,
  }) => {
    const timeOff = timeOffService(orm);
    const employees = employeeServices(orm);
    const patterns = workingPatternService(orm);
    const policyGroupId = await seed.everyoneGroupId();
    const policy = (await timeOff.listPolicies(OWNER, orm)).find(({ key }) => key === policyKey)!;
    await transact((tx) =>
      timeOff.linkGroupPolicies(OWNER, tx, {
        policyGroupId,
        timeOffPolicyIds: [policy.id],
      }),
    );

    await fc.assert(
      fc.asyncProperty(employmentAndPattern(), employmentAndPattern(), async (a, b) => {
        const employee = await seed.employee({ startDate: a.startDate });
        const patternA = await patterns.createPattern(OWNER, {
          name: `${employee.id}-A`,
          ...a.week,
        });
        const patternB = await patterns.createPattern(OWNER, {
          name: `${employee.id}-B`,
          ...b.week,
        });
        let original: Awaited<ReturnType<typeof allowanceSnapshot>> = [];
        let previous: Awaited<ReturnType<typeof allowanceSnapshot>> = [];

        // Same-date corrections restore exactly A's input timeline, even across leave years.
        for (const [index, state] of [
          { startDate: a.startDate, patternId: patternA.id },
          { startDate: b.startDate, patternId: patternB.id },
          { startDate: a.startDate, patternId: patternA.id },
        ].entries()) {
          await employees.updateEmployee(OWNER, { id: employee.id, startDate: state.startDate });
          await patterns.assignPattern(OWNER, {
            employeeId: employee.id,
            workingPatternId: state.patternId,
            effectiveFrom: calendarDate("2025-01-01"),
            effectiveUntil: null,
          });
          const input = {
            employeeIds: [employee.id],
            cause: { kind: "WORKING_PATTERN_CHANGED" as const, ref: "2025-01-01" },
          };
          await transact((tx) => timeOff.ensureAllowances(OWNER, tx, input));
          const current = await allowanceSnapshot(orm, employee.id);
          if (index === 0) {
            expect(current).toHaveLength(1);
            original = current;
          }
          for (const earlier of previous) {
            const after = current.find(({ allowance }) => allowance.id === earlier.allowance.id)!;
            expect(after).toBeDefined();
            expect(after.allowance).toEqual(earlier.allowance);
            for (const line of earlier.lines) {
              expect(after.lines.find(({ id }) => id === line.id)).toEqual(line);
            }
          }
          if (index === 1) {
            // B must actually apply: compare its anchor year with a fresh employee at B.
            const fresh = await seed.employee({ startDate: b.startDate });
            await patterns.assignPattern(OWNER, {
              employeeId: fresh.id,
              workingPatternId: patternB.id,
              effectiveFrom: calendarDate("2025-01-01"),
              effectiveUntil: null,
            });
            await transact((tx) =>
              timeOff.ensureAllowances(OWNER, tx, {
                ...input,
                employeeIds: [fresh.id],
              }),
            );
            const freshB = await allowanceSnapshot(orm, fresh.id);
            expect(freshB).toHaveLength(1);
            const sameYear = current.find(
              ({ allowance }) => allowance.leaveYearStart === freshB[0]!.allowance.leaveYearStart,
            )!;
            expect(sameYear).toBeDefined();
            expect(allowanceIdentitySums(sameYear.lines)).toEqual(
              allowanceIdentitySums(freshB[0]!.lines),
            );
            for (const row of current) {
              if (b.startDate !== null && row.allowance.leaveYearEnd < b.startDate) {
                expect(allowanceIdentitySums(row.lines)).toEqual([]);
              }
            }
          }
          await transact((tx) => timeOff.ensureAllowances(OWNER, tx, input));
          expect(await allowanceSnapshot(orm, employee.id)).toEqual(current);
          previous = current;
        }

        // B may create future allowances; compare the original years rather than allowance sets.
        for (const before of original) {
          const restored = previous.find(({ allowance }) => allowance.id === before.allowance.id)!;
          expect(allowanceIdentitySums(restored.lines)).toEqual(
            allowanceIdentitySums(before.lines),
          );
        }
      }),
      { numRuns: 20, seed: 209202601 },
    );
  });
}

function employmentAndPattern() {
  return fc.record({
    startDate: fc.option(
      fc
        .integer({ min: -365, max: 1095 })
        .map((offset) => addDays(calendarDate("2026-01-01"), offset)),
    ),
    week: fc.integer({ min: 1, max: 1440 }).chain((fullDayMinutes) =>
      fc.record({
        fullDayMinutes: fc.constant(fullDayMinutes),
        minutes: fc
          .array(fc.integer({ min: 0, max: fullDayMinutes }), { minLength: 7, maxLength: 7 })
          .filter((minutes) => minutes.some((day) => day > 0))
          .map((minutes) => minutes as [number, number, number, number, number, number, number]),
        bankHolidayCalendar: fc.constantFrom("england_and_wales", "scotland", "northern_ireland"),
      }),
    ),
  });
}
