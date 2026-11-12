import fc from "fast-check";

import {
  calendarDate,
  type Drafts,
  expect,
  OWNER,
  readAllowances,
  readPublishedAssignments,
  saveDrafts,
  seedTermsWithPeople,
  test,
  timeOffPolicyService,
  timeOffService,
  transactWithTimeOffEvents,
  type Week,
  workingPatternService,
} from "#test/support";

import { ApplicationError } from "../../../core/applicationError";
import { addDays, type CalendarDate } from "../../../utils";
import { BANK_HOLIDAY_CALENDARS } from "../../bankHolidays";
import type { WeekdayMinutes } from "../../employees";

const TODAY = "2026-06-01";

test("property: after any publishes and cancels, allowances are up to date and match a newcomer's", async ({
  orm,
  seed,
  transact,
}) => {
  // Cancelling a week recalculates allowances through its event, as in production.
  const withEvents = transactWithTimeOffEvents(orm);
  const service = timeOffPolicyService(orm, { transact: withEvents });
  const patterns = workingPatternService(orm, { transact: withEvents });
  const engine = timeOffService(orm);
  const ensure = (employeeIds: string[]) =>
    transact((tx) =>
      engine.ensureAllowances(OWNER, tx, {
        employeeIds,
        cause: { kind: "DAILY_CHECK", ref: TODAY },
      }),
    );

  await fc.assert(
    fc.asyncProperty(fc.array(step(), { minLength: 1 }), async (steps) => {
      // Arrange
      const place = await seedTermsWithPeople({ orm, seed, transact });

      // Act
      for (const current of steps) {
        if (current.kind === "publish") {
          await saveDrafts(orm, place.termsId, current.drafts);
          const suggestions = await service.readPublishSuggestions(OWNER, {
            termsId: place.termsId,
            from: current.startDate,
          });
          const published = await expectOnlyRefusedAs(
            service.publishTerms(OWNER, {
              termsId: place.termsId,
              versions: suggestions.versions,
              startDate: current.startDate,
              owners: suggestions.owners
                .filter((_, index) => current.ticks[index])
                .map(({ owner }) => owner),
            }),
            ["INVALID_INPUT:rules.balance:not_leave_year_start"],
          );
          for (const { id, timeOffTypeId } of published ? [] : suggestions.versions) {
            // A refused publish leaves its drafts; drop them so the next step starts clean.
            await (timeOffTypeId === null
              ? patterns.discardWorkingPattern(OWNER, { versionId: id })
              : service.discardTimeOffPolicy(OWNER, { versionId: id }));
          }
        } else {
          const { weekAssignments, ruleAssignments } = await readPublishedAssignments(orm, place);
          const rows = current.of === "week" ? weekAssignments : ruleAssignments;
          const planned = rows.filter((row) => "termsId" in row.owner && row.startDate > TODAY);
          const row = planned[current.pick % Math.max(planned.length, 1)];
          if (row) {
            await expectOnlyRefusedAs(
              current.of === "week"
                ? patterns.cancelWorkingPatternChange(OWNER, { assignmentId: row.id })
                : service.cancelPolicyChange(OWNER, { assignmentId: row.id }),
              ["CONFLICT"],
            );
          }
        }

        // Assert: what publish and cancel left is what a fresh calculation gives.
        expect((await ensure(place.employeeIds)).linesAppended).toBe(0);
      }
      const newcomer = await seed.employee({ startDate: "2025-01-01" });
      await seed.moveToTerms(newcomer.id, place.termsId);
      await ensure([newcomer.id]);

      // Assert: the member's allowances do not depend on the history that led to them.
      expect(await totals(orm, newcomer.id)).toEqual(await totals(orm, place.memberId));
    }),
    { numRuns: 40 },
  );
});

// Helpers

async function expectOnlyRefusedAs(action: Promise<unknown>, allowed: string[]) {
  try {
    await action;
    return true;
  } catch (error) {
    if (!(error instanceof ApplicationError)) throw error;
    const reasons = [
      error.code,
      ...error.fieldErrors.map(({ field, code }) => `${error.code}:${field}:${code}`),
    ];
    if (!reasons.some((reason) => allowed.includes(reason))) throw error;
    return false;
  }
}

/** A person's non-zero allowance totals: a fully reversed allowance keeps its row at 0. */
async function totals(orm: Parameters<typeof readAllowances>[0], employeeId: string) {
  return (await readAllowances(orm, employeeId))
    .filter(({ total }) => total !== 0)
    .map(({ typeKey, leaveYearStart, total }) => ({ typeKey, leaveYearStart, total }));
}

type Step =
  | { kind: "publish"; drafts: Drafts; startDate: CalendarDate; ticks: boolean[] }
  | { kind: "cancel"; of: "week" | "rules"; pick: number };

function step(): fc.Arbitrary<Step> {
  return fc.oneof(
    fc.record({
      kind: fc.constant("publish" as const),
      drafts: change(),
      startDate: fc.oneof(changeDate(), leaveYearStart()),
      ticks: fc.array(fc.boolean()),
    }),
    fc.record({
      kind: fc.constant("cancel" as const),
      of: fc.constantFrom("week" as const, "rules" as const),
      pick: fc.nat(),
    }),
  );
}

function week(): fc.Arbitrary<Week> {
  // A day forced above zero keeps at least one working day without filtering.
  return fc
    .record({
      minutes: fc.array(fc.integer({ min: 0, max: 1440 }), { minLength: 7, maxLength: 7 }),
      workingDay: fc.integer({ min: 0, max: 6 }),
      workingMinutes: fc.integer({ min: 1, max: 1440 }),
      bankHolidayCalendar: fc.constantFrom(...BANK_HOLIDAY_CALENDARS),
    })
    .map(({ minutes, workingDay, workingMinutes, bankHolidayCalendar }) => ({
      minutes: minutes.with(workingDay, workingMinutes) as unknown as WeekdayMinutes,
      bankHolidayCalendar,
    }));
}

function rules(): fc.Arbitrary<NonNullable<Drafts["rules"]>> {
  return fc.oneof(
    fc.record({
      balance: fc.constant("balance_from_allowance" as const),
      entitlementDays: fc.integer({ min: 0, max: 732 }).map((halves) => halves / 2),
      bankHolidays: fc.constantFrom(
        "bank_holidays_on_top_of_allowance" as const,
        "bank_holidays_included_in_allowance" as const,
      ),
    }),
    fc.record({ balance: fc.constantFrom("unlimited_balance" as const, "no_balance" as const) }),
  );
}

function change(): fc.Arbitrary<Drafts> {
  return fc.oneof(
    fc.record({ week: week() }),
    fc.record({ rules: rules() }),
    fc.record({ week: week(), rules: rules() }),
  );
}

/** A date publishing may start from: this leave year or the next. */
function changeDate(): fc.Arbitrary<CalendarDate> {
  return fc.integer({ min: 0, max: 729 }).map((days) => addDays(calendarDate("2026-01-01"), days));
}

function leaveYearStart(): fc.Arbitrary<CalendarDate> {
  return fc.constantFrom(calendarDate("2026-01-01"), calendarDate("2027-01-01"));
}
