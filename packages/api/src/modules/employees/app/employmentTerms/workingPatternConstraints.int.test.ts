import { calendarDate, expect, test, seedWorkingPattern, seedTermsWeek } from "#test/support";
import { workingPatternRepository } from "../../db";

test.for(["employee", "terms"] as const)(
  "the database refuses overlapping %s week assignments",
  async (kind, { orm, seed }) => {
    const owner =
      kind === "employee"
        ? { employeeId: (await seed.employee()).id }
        : { termsId: await seed.terms("Scotland") };
    const { versionId } = await seedWorkingPattern(orm);
    const repository = workingPatternRepository(orm);
    await repository.insertAssignment({
      owner,
      versionId,
      startDate: calendarDate("2026-06-01"),
      endDate: calendarDate("2026-06-30"),
    });

    await expect(
      repository.insertAssignment({
        owner,
        versionId,
        startDate: calendarDate("2026-06-30"),
        endDate: null,
      }),
    ).rejects.toMatchObject({ cause: { code: "23P01" } });
  },
);

test("the database permits adjacent assignments and different owners", async ({ orm, seed }) => {
  const first = await seed.terms("First");
  const other = await seed.terms("Other");
  const { versionId } = await seedTermsWeek(orm, {
    termsId: first,
    startDate: "2026-01-01",
    endDate: "2026-05-31",
  });
  const repository = workingPatternRepository(orm);

  await repository.insertAssignment({
    owner: { termsId: first },
    versionId,
    startDate: calendarDate("2026-06-01"),
    endDate: null,
  });
  await repository.insertAssignment({
    owner: { termsId: other },
    versionId,
    startDate: calendarDate("2026-01-01"),
    endDate: null,
  });

  expect(await repository.findAssignments({ termsIds: [first, other] })).toHaveLength(3);
});

test("the database refuses a week assignment with both owners", async ({ orm, seed }) => {
  const owner = { employeeId: (await seed.employee()).id, termsId: await seed.terms("Scotland") };
  const { versionId } = await seedWorkingPattern(orm);

  await expect(
    workingPatternRepository(orm).insertAssignment({
      owner,
      versionId,
      startDate: calendarDate("2026-01-01"),
      endDate: null,
    }),
  ).rejects.toMatchObject({ cause: { code: "23514" } });
});

test("the database refuses a week assignment without an owner", async ({ orm }) => {
  const { versionId } = await seedWorkingPattern(orm);

  await expect(
    workingPatternRepository(orm).insertAssignment({
      // @ts-expect-error Deliberately malformed input reaches the database owner constraint.
      owner: {},
      versionId,
      startDate: calendarDate("2026-01-01"),
      endDate: null,
    }),
  ).rejects.toMatchObject({ cause: { code: "23514" } });
});
