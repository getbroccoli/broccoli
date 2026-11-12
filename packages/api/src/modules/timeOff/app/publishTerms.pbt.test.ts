import fc from "fast-check";

import {
  allowanceIdentitySums,
  calendarDate,
  type Drafts,
  expect,
  OWNER,
  peopleSnapshot,
  placeSnapshot,
  readPublishedAssignments,
  readWeeks,
  saveDrafts,
  seedTermsWithPeople,
  test,
  timeOffPolicyService,
  transactWithTimeOffEvents,
  type Week,
  workingPatternService,
} from "#test/support";

import { addDays, type CalendarDate } from "../../../utils";
import { BANK_HOLIDAY_CALENDARS } from "../../bankHolidays";
import type { WeekdayMinutes } from "../../employees";
import type { PublishTermsInput } from "./termsPublish";

const TODAY = "2026-06-01";

test("property: publishing changes only the people listed under ticked owners, and no day before its start", async ({
  orm,
  seed,
  transact,
}) => {
  const service = timeOffPolicyService(orm);

  await fc.assert(
    fc.asyncProperty(
      change(),
      changeDate(),
      fc.array(fc.boolean()),
      async (drafts, startDate, ticks) => {
        // Arrange
        const place = await seedTermsWithPeople({ orm, seed, transact });
        await saveDrafts(orm, place.termsId, drafts);
        const suggestions = await service.readPublishSuggestions(OWNER, {
          termsId: place.termsId,
          from: startDate,
        });
        const ticked = suggestions.owners.filter((_, index) => ticks[index]);
        const before = await peopleSnapshot(orm, place.employeeIds);
        const pastBefore = await readWeeks(orm, place.employeeIds, addDays(startDate, -1));

        // Act
        await service.publishTerms(OWNER, {
          termsId: place.termsId,
          versions: suggestions.versions,
          startDate,
          owners: ticked.map(({ owner }) => owner),
        });

        // Assert
        const reached = new Set(ticked.flatMap(({ reached }) => reached.map(({ id }) => id)));
        const after = await peopleSnapshot(orm, place.employeeIds);
        for (const id of place.employeeIds.filter((id) => !reached.has(id))) {
          expect(after.get(id)).toEqual(before.get(id));
        }
        expect(await readWeeks(orm, place.employeeIds, addDays(startDate, -1))).toEqual(pastBefore);
      },
    ),
    { numRuns: 20 },
  );
});

test("property: a member of ticked terms without a week of their own works the published week from its start", async ({
  orm,
  seed,
  transact,
}) => {
  const service = timeOffPolicyService(orm);

  await fc.assert(
    fc.asyncProperty(week(), changeDate(), async (drafted, startDate) => {
      // Arrange
      const place = await seedTermsWithPeople({ orm, seed, transact });
      await saveDrafts(orm, place.termsId, { week: drafted });
      const suggestions = await service.readPublishSuggestions(OWNER, {
        termsId: place.termsId,
        from: startDate,
      });

      // Act
      await service.publishTerms(OWNER, {
        termsId: place.termsId,
        versions: suggestions.versions,
        startDate,
        owners: [{ termsId: place.termsId }],
      });

      // Assert
      const weeks = await workingPatternService(orm).readWorkingWeeks(OWNER, {
        employeeIds: [place.memberId],
        from: startDate,
        until: startDate,
      });
      expect(weeks.get(place.memberId)).toEqual([{ startDate, ...drafted }]);
    }),
    { numRuns: 20 },
  );
});

test("property: a refused publish leaves the terms, their people and their allowances as they were", async ({
  orm,
  seed,
  transact,
}) => {
  const service = timeOffPolicyService(orm);

  await fc.assert(
    fc.asyncProperty(change(), changeDate(), refusal(), async (drafts, startDate, refused) => {
      // Arrange
      const place = await seedTermsWithPeople({ orm, seed, transact });
      await saveDrafts(orm, place.termsId, drafts);
      const suggestions = await service.readPublishSuggestions(OWNER, {
        termsId: place.termsId,
        from: startDate,
      });
      const input: PublishTermsInput & { owners: PublishTermsInput["owners"][number][] } = {
        termsId: place.termsId,
        versions: suggestions.versions,
        startDate,
        owners: [{ termsId: place.termsId }],
      };
      if (refused.kind === "draft_saved_again") await saveDrafts(orm, place.termsId, drafts);
      if (refused.kind === "before_this_leave_year") input.startDate = refused.startDate;
      if (refused.kind === "owner_not_suggested")
        input.owners.push({ employeeId: place.outsiderId });
      const before = await placeSnapshot(orm, place);

      // Act
      const publishing = service.publishTerms(OWNER, input);

      // Assert
      await expect(publishing).rejects.toThrow();
      expect(await placeSnapshot(orm, place)).toEqual(before);
    }),
    { numRuns: 20 },
  );
});

test("property: cancelling a planned publish restores the assignments, weeks and allowance sums", async ({
  orm,
  seed,
  transact,
}) => {
  const withEvents = transactWithTimeOffEvents(orm);
  const service = timeOffPolicyService(orm, { transact: withEvents });
  const patterns = workingPatternService(orm, { transact: withEvents });

  await fc.assert(
    fc.asyncProperty(change(), plannedDate(), async (drafts, startDate) => {
      // Arrange
      const place = await seedTermsWithPeople({ orm, seed, transact });
      await saveDrafts(orm, place.termsId, drafts);
      const suggestions = await service.readPublishSuggestions(OWNER, {
        termsId: place.termsId,
        from: startDate,
      });
      const before = await placeSnapshot(orm, place);
      await service.publishTerms(OWNER, {
        termsId: place.termsId,
        versions: suggestions.versions,
        startDate,
        owners: [{ termsId: place.termsId }],
      });

      // Act
      const { weekAssignments, ruleAssignments } = await readPublishedAssignments(orm, place);
      for (const { id } of startingOn(weekAssignments, startDate)) {
        await patterns.cancelWorkingPatternChange(OWNER, { assignmentId: id });
      }
      for (const { id } of startingOn(ruleAssignments, startDate)) {
        await service.cancelPolicyChange(OWNER, { assignmentId: id });
      }

      // Assert
      const after = await placeSnapshot(orm, place);
      expect(after.weekAssignments).toEqual(before.weekAssignments);
      expect(after.ruleAssignments).toEqual(before.ruleAssignments);
      expect(after.weeks).toEqual(before.weeks);
      for (const [index, allowances] of before.allowances.entries()) {
        for (const { allowance, lines } of allowances) {
          const now = after.allowances[index]!.find((row) => row.allowance.id === allowance.id)!;
          expect(allowanceIdentitySums(now.lines)).toEqual(allowanceIdentitySums(lines));
        }
      }
    }),
    { numRuns: 20 },
  );
});

// Helpers

function startingOn<R extends { id: string; startDate: string }>(
  rows: readonly R[],
  date: string,
): R[] {
  return rows.filter(({ startDate }) => startDate === date);
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

function rules(): fc.Arbitrary<Extract<NonNullable<Drafts["rules"]>, { entitlementDays: number }>> {
  // Same balance as the seeded Annual leave, so any date counts the same way and is never refused.
  return fc.record({
    balance: fc.constant("balance_from_allowance" as const),
    entitlementDays: fc.integer({ min: 0, max: 732 }).map((halves) => halves / 2),
    bankHolidays: fc.constantFrom(
      "bank_holidays_on_top_of_allowance" as const,
      "bank_holidays_included_in_allowance" as const,
    ),
  });
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

/** A date after today, so the change is planned and may be cancelled. */
function plannedDate(): fc.Arbitrary<CalendarDate> {
  return fc.integer({ min: 1, max: 578 }).map((days) => addDays(calendarDate(TODAY), days));
}

function refusal() {
  return fc.oneof(
    fc.constant({ kind: "draft_saved_again" as const }),
    fc.constant({ kind: "owner_not_suggested" as const }),
    fc.integer({ min: 1, max: 3650 }).map((days) => ({
      kind: "before_this_leave_year" as const,
      startDate: addDays(calendarDate("2026-01-01"), -days),
    })),
  );
}
