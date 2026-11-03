import fc from "fast-check";

import {
  allowanceIdentitySums,
  allowanceSnapshot,
  calendarDate,
  expect,
  OWNER,
  test,
  timeOffService,
} from "#test/support";

import { addDays } from "../../../utils";

for (const policyKey of [
  "uk_statutory_minimum",
  "uk_20_days_plus_bank_holidays",
  "uk_25_days_plus_bank_holidays",
]) {
  test(`invariant: leaving and rejoining the terms reverses and restores grants (${policyKey})`, async ({
    orm,
    seed,
    transact,
  }) => {
    const timeOff = timeOffService(orm);
    const termsId = await seed.englandAndWalesTermsId();
    const policy = (await timeOff.listPolicies(OWNER, orm)).find(({ key }) => key === policyKey)!;
    await transact((tx) =>
      timeOff.linkTermsPolicies(OWNER, tx, {
        termsId,
        timeOffPolicyIds: [policy.id],
      }),
    );

    await fc.assert(
      fc.asyncProperty(startDate(), async (startDate) => {
        const employee = await seed.employee({ startDate });
        const input = {
          employeeIds: [employee.id],
          cause: { kind: "DAILY_CHECK" as const, ref: "2026-06-01" },
        };
        await transact((tx) => timeOff.ensureAllowances(OWNER, tx, input));
        const original = await allowanceSnapshot(orm, employee.id);
        expect(original).toHaveLength(1);
        expect(allowanceIdentitySums(original[0]!.lines).length).toBeGreaterThan(0);
        let previous = original;

        // Being on no terms means neither a policy nor a working pattern applies, for all dates.
        for (const isMember of [false, true]) {
          if (isMember) await seed.moveToTerms(employee.id, termsId);
          else await seed.leaveTerms(employee.id);
          await transact((tx) => timeOff.ensureAllowances(OWNER, tx, input));
          const current = await allowanceSnapshot(orm, employee.id);
          expect(current).toHaveLength(original.length);
          for (const earlier of previous) {
            const after = current.find(({ allowance }) => allowance.id === earlier.allowance.id)!;
            expect(after).toBeDefined();
            expect(after.allowance).toEqual(earlier.allowance);
            for (const line of earlier.lines) {
              expect(after.lines.find(({ id }) => id === line.id)).toEqual(line);
            }
            const initial = original.find(
              ({ allowance }) => allowance.id === earlier.allowance.id,
            )!;
            expect(allowanceIdentitySums(after.lines)).toEqual(
              isMember ? allowanceIdentitySums(initial.lines) : [],
            );
          }
          await transact((tx) => timeOff.ensureAllowances(OWNER, tx, input));
          expect(await allowanceSnapshot(orm, employee.id)).toEqual(current);
          previous = current;
        }
      }),
      { numRuns: 12, seed: 209202602 },
    );
  });
}

function startDate() {
  // Include holidays, adjacent days, and future starters without depending on today's date.
  return fc.option(
    fc.oneof(
      fc
        .constantFrom(
          "2026-04-02",
          "2026-04-03",
          "2026-04-04",
          "2026-04-06",
          "2026-05-31",
          "2026-06-01",
          "2026-12-25",
          "2027-01-01",
        )
        .map(calendarDate),
      fc
        .integer({ min: -365, max: 729 })
        .map((offset) => addDays(calendarDate("2026-01-01"), offset)),
    ),
  );
}
