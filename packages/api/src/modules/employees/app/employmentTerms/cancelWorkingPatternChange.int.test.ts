import {
  termsService,
  expect,
  OWNER,
  test,
  workingPatternService,
  seedTermsWeek,
} from "#test/support";
import { workingPatternRepository } from "../../db";

test("cancelling a planned week restores the earlier assignment's end", async ({ orm, seed }) => {
  const termsId = await seed.terms("Scotland");
  const first = await seedTermsWeek(orm, {
    termsId,
    startDate: "2026-01-01",
    endDate: "2026-11-30",
  });
  const planned = await seedTermsWeek(orm, {
    termsId,
    startDate: "2026-12-01",
    endDate: "2026-12-31",
    minutes: [480, 480, 480, 480, 0, 0, 0],
  });
  const later = await seedTermsWeek(orm, { termsId, startDate: "2027-01-01" });

  await workingPatternService(orm).cancelWorkingPatternChange(OWNER, {
    assignmentId: planned.assignmentId,
  });

  expect(
    await workingPatternRepository(orm).findAssignments({ termsIds: [termsId] }),
  ).toMatchObject([
    { id: first.assignmentId, startDate: "2026-01-01", endDate: "2026-12-31" },
    { id: later.assignmentId, startDate: "2027-01-01", endDate: null },
  ]);
});

test("cancelling a planned week writes one history line for the cancelled settings", async ({
  orm,
  seed,
}) => {
  const termsId = await seed.terms("Scotland");
  const planned = await seedTermsWeek(orm, {
    termsId,
    startDate: "2026-12-01",
    minutes: [480, 480, 480, 480, 0, 0, 0],
  });

  await workingPatternService(orm).cancelWorkingPatternChange(OWNER, {
    assignmentId: planned.assignmentId,
  });

  const page = await termsService(orm).readTermsHistory(OWNER, termsId, {});
  expect(page.edges).toHaveLength(1);
  const line = page.edges[0]!.node;
  expect(line).toMatchObject({
    recordType: "terms",
    recordId: termsId,
    operation: "UPDATED",
    cause: { kind: "EDITED_DIRECTLY" },
  });
  expect(line.changes).toHaveLength(1);
  expect(line.changes[0]).toMatchObject({ field: "workingWeek", newValue: null });
  expect(JSON.parse(line.changes[0]!.oldValue!)).toEqual({
    startDate: "2026-12-01",
    minutes: [480, 480, 480, 480, 0, 0, 0],
    bankHolidayCalendar: "england_and_wales",
  });
});

test.for(["2026-05-31", "2026-06-01"])(
  "refuses cancelling a week starting on %s",
  async (startDate, { orm, seed }) => {
    const termsId = await seed.terms("Scotland");
    const week = await seedTermsWeek(orm, { termsId, startDate });
    const repository = workingPatternRepository(orm);
    const before = await repository.findAssignments({ termsIds: [termsId] });

    await expect(
      workingPatternService(orm).cancelWorkingPatternChange(OWNER, {
        assignmentId: week.assignmentId,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT", message: "This change has already started." });

    expect(await repository.findAssignments({ termsIds: [termsId] })).toEqual(before);
  },
);

test("refuses cancelling an unknown assignment", async ({ orm }) => {
  await expect(
    workingPatternService(orm).cancelWorkingPatternChange(OWNER, {
      assignmentId: "00000000-0000-4000-8000-000000000001",
    }),
  ).rejects.toMatchObject({ code: "NOT_FOUND", message: "No working week change has this id." });
});
