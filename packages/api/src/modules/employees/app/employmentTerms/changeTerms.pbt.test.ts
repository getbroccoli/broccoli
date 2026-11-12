import fc from "fast-check";

import {
  calendarDate,
  expect,
  giveTermsPolicies,
  OWNER,
  seedEmploymentEnd,
  seedTermsWeek,
  test,
  timeOffService,
  transactWithTimeOffEvents,
  workingPatternService,
} from "#test/support";

import { ApplicationError } from "../../../../core/applicationError";
import { addDays, type CalendarDate } from "../../../../utils";

const TODAY = "2026-06-01";

test("property: a move does what its preview shows, and allowances stay up to date", async ({
  orm,
  seed,
  transact,
}) => {
  // Moves recalculate allowances through their event, as in production.
  const service = workingPatternService(orm, { transact: transactWithTimeOffEvents(orm) });
  const timeOff = timeOffService(orm);

  await fc.assert(
    fc.asyncProperty(person(), fc.array(step(), { minLength: 1 }), async (who, steps) => {
      // Arrange
      const england = await seed.terms();
      await seedTermsWeek(orm, { termsId: england, startDate: "2000-01-01" });
      const scotland = await seed.terms();
      await seedTermsWeek(orm, {
        termsId: scotland,
        minutes: [480, 480, 480, 480, 0, 0, 0],
        bankHolidayCalendar: "scotland",
        startDate: "2000-01-01",
      });
      const employee = await seed.employee({ startDate: who.startDate });
      if (who.endDate) await seedEmploymentEnd(orm, employee.id, who.endDate);
      await seed.moveToTerms(employee.id, england);
      await giveTermsPolicies(orm, transact, {
        termsId: england,
        policies: [{ key: "uk_20_days_plus_bank_holidays" }],
      });
      await giveTermsPolicies(orm, transact, {
        termsId: scotland,
        policies: [{ key: "uk_25_days_plus_bank_holidays" }],
      });
      const employeeIds = [employee.id];

      for (const current of steps) {
        if (current.kind === "move") {
          const input = {
            employeeIds,
            termsId: current.toScotland ? scotland : england,
            startDate: current.startDate,
          };
          const move = { termsId: input.termsId, startDate: current.startDate };
          const preview = await service.previewTermsChange(OWNER, input);
          const termsPreview = await service.readEmploymentTerms(OWNER, { employeeIds, move });
          const timeOffPreview = await timeOff.readPersonTimeOff(OWNER, { employeeIds, move });

          // Act
          const result = await service.changeTerms(OWNER, input);

          // Assert
          expect(result).toEqual({
            moved: preview.moved.map(({ employeeId, startDate }) => ({ employeeId, startDate })),
            skipped: preview.skipped,
          });
          expect(await service.readEmploymentTerms(OWNER, { employeeIds })).toEqual(termsPreview);
          expect(await timeOff.readPersonTimeOff(OWNER, { employeeIds })).toEqual(timeOffPreview);
        } else {
          const terms = (await service.readEmploymentTerms(OWNER, { employeeIds })).get(
            employee.id,
          )!;
          const planned = terms.periods.flatMap(({ startDate }) =>
            startDate !== null && startDate > TODAY ? [startDate] : [],
          );
          const startDate = planned[current.pick % Math.max(planned.length, 1)];
          if (startDate === undefined) continue;

          // Act
          await expectCancelOrConflict(
            service.cancelTermsChange(OWNER, {
              employeeId: employee.id,
              startDate,
            }),
          );
        }

        // Assert: what the step left is what a fresh calculation gives.
        const ensured = await transact((tx) =>
          timeOff.ensureAllowances(OWNER, tx, {
            employeeIds,
            cause: { kind: "DAILY_CHECK", ref: TODAY },
          }),
        );
        expect(ensured.linesAppended).toBe(0);
      }
    }),
    { numRuns: 40 },
  );
});

// Helpers

async function expectCancelOrConflict(action: Promise<void>): Promise<void> {
  try {
    await action;
  } catch (error) {
    expect(error).toBeInstanceOf(ApplicationError);
    expect(error).toMatchObject({ code: "CONFLICT" });
  }
}

type Step =
  { kind: "move"; toScotland: boolean; startDate: CalendarDate } | { kind: "cancel"; pick: number };

function step(): fc.Arbitrary<Step> {
  return fc.oneof(
    fc.record({ kind: fc.constant("move" as const), toScotland: fc.boolean(), startDate: date() }),
    fc.record({ kind: fc.constant("cancel" as const), pick: fc.nat() }),
  );
}

/** A start date around this leave year, and sometimes a leaving date after it. */
function person() {
  return fc
    .record({ startDate: date(-365), leavesAfter: fc.option(fc.nat({ max: 900 })) })
    .map(({ startDate, leavesAfter }) => ({
      startDate,
      endDate: leavesAfter === null ? null : addDays(startDate, leavesAfter),
    }));
}

/** A date from `fromDays` days before this leave year to the end of the next one. */
function date(fromDays = 0): fc.Arbitrary<CalendarDate> {
  return fc
    .integer({ min: fromDays, max: 729 })
    .map((days) => addDays(calendarDate("2026-01-01"), days));
}
