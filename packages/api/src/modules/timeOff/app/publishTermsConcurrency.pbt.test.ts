import fc from "fast-check";

import {
  calendarDate,
  expect,
  OWNER,
  readPublishedAssignments,
  saveDrafts,
  seedTermsWithPeople,
  test,
  timeOffPolicyService,
  timeOffService,
  transactWithTimeOffEvents,
} from "#test/support";
import { ApplicationError } from "../../../core/applicationError";
import { addDays } from "../../../utils";

test("property: concurrent publishes of the same drafts leave one winner and consistent allowances", async ({
  orm,
  seed,
  transact,
}) => {
  await fc.assert(
    fc.asyncProperty(
      fc.integer({ min: 1, max: 1440 }),
      fc.integer({ min: 0, max: 732 }),
      fc.tuple(fc.nat({ max: 729 }), fc.nat({ max: 729 })),
      async (minutes, halfDays, offsets) => {
        // Arrange
        const place = await seedTermsWithPeople({ orm, seed, transact });
        await saveDrafts(orm, place.termsId, {
          week: { minutes: [minutes, 0, 0, 0, 0, 0, 0], bankHolidayCalendar: "scotland" },
          rules: {
            balance: "balance_from_allowance",
            entitlementDays: halfDays / 2,
            bankHolidays: "bank_holidays_on_top_of_allowance",
          },
        });
        const publishers = offsets.map(() =>
          timeOffPolicyService(orm, { transact: transactWithTimeOffEvents(orm) }),
        );
        const suggestions = await publishers[0]!.readPublishSuggestions(OWNER, {
          termsId: place.termsId,
          from: "2026-01-01",
        });

        // Act: each use case opens its own transaction on the pool.
        const results = await Promise.allSettled(
          publishers.map((publisher, index) =>
            publisher.publishTerms(OWNER, {
              termsId: place.termsId,
              versions: suggestions.versions,
              startDate: addDays(calendarDate("2026-01-01"), offsets[index]!),
              owners: suggestions.owners.map(({ owner }) => owner),
            }),
          ),
        );

        // Assert
        expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
        for (const result of results) {
          if (result.status === "fulfilled") continue;
          expect(result.reason).toBeInstanceOf(ApplicationError);
          expect(["CONFLICT", "INVALID_INPUT"]).toContain((result.reason as ApplicationError).code);
        }
        const rows = await readPublishedAssignments(orm, place);
        expectNoOverlap(rows.weekAssignments);
        expectNoOverlap(rows.ruleAssignments);
        const ensured = await transact((tx) =>
          timeOffService(orm).ensureAllowances(OWNER, tx, {
            employeeIds: place.employeeIds,
            cause: { kind: "DAILY_CHECK", ref: "2026-06-01" },
          }),
        );
        expect(ensured.linesAppended).toBe(0);
      },
    ),
    { numRuns: 20 },
  );
});

// Helpers

function expectNoOverlap(
  rows: {
    owner: { termsId: string } | { employeeId: string };
    timeOffTypeId?: string;
    startDate: string;
    endDate: string | null;
  }[],
) {
  const lanes = Map.groupBy(
    rows,
    (row) =>
      `${"termsId" in row.owner ? row.owner.termsId : row.owner.employeeId}:${row.timeOffTypeId ?? "week"}`,
  );
  for (const lane of lanes.values()) {
    const sorted = lane.toSorted((a, b) => a.startDate.localeCompare(b.startDate));
    for (const [index, row] of sorted.entries()) {
      expect(row.endDate === null || row.startDate <= row.endDate).toBe(true);
      if (index === 0) continue;
      expect(sorted[index - 1]!.endDate).not.toBeNull();
      expect(sorted[index - 1]!.endDate! < row.startDate).toBe(true);
    }
  }
}
