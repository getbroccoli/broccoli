import { calendarDate, expect, seedTimeOffPolicy, test } from "#test/support";
import { timeOffPolicyRepository } from "../db";

test.for(["terms", "employee"] as const)(
  "the database refuses overlapping policy assignments for one %s and type",
  async (kind, { orm, seed }) => {
    const policy = await seedTimeOffPolicy(orm, {
      name: "Study leave",
      balance: "unlimited_balance",
    });
    const owner =
      kind === "terms"
        ? { termsId: await seed.defaultTermsId() }
        : { employeeId: (await seed.employee()).id };
    const repository = timeOffPolicyRepository(orm);
    await repository.insertAssignment({
      owner,
      timeOffTypeId: policy.timeOffTypeId,
      timeOffPolicyId: policy.id,
      versionId: policy.versionId,
      startDate: calendarDate("2026-01-01"),
      endDate: calendarDate("2026-06-30"),
    });

    await expect(
      repository.insertAssignment({
        owner,
        timeOffTypeId: policy.timeOffTypeId,
        timeOffPolicyId: policy.id,
        versionId: policy.versionId,
        startDate: calendarDate("2026-06-30"),
        endDate: null,
      }),
    ).rejects.toMatchObject({ cause: { code: "23P01" } });
  },
);

test("assignments of different types may cover the same owner on the same date", async ({
  orm,
  seed,
}) => {
  const owner = { termsId: await seed.defaultTermsId() };
  const study = await seedTimeOffPolicy(orm, { name: "Study leave", balance: "unlimited_balance" });
  const moving = await seedTimeOffPolicy(orm, { name: "Moving day", balance: "unlimited_balance" });
  const repository = timeOffPolicyRepository(orm);
  await repository.insertAssignment({
    owner,
    timeOffTypeId: study.timeOffTypeId,
    timeOffPolicyId: study.id,
    versionId: study.versionId,
    startDate: calendarDate("2026-01-01"),
    endDate: null,
  });

  await repository.insertAssignment({
    owner,
    timeOffTypeId: moving.timeOffTypeId,
    timeOffPolicyId: moving.id,
    versionId: moving.versionId,
    startDate: calendarDate("2026-01-01"),
    endDate: null,
  });

  expect(await repository.findAssignments({ termsIds: [owner.termsId] })).toHaveLength(2);
});

test("the database refuses a policy assignment with both owners", async ({ orm, seed }) => {
  const policy = await seedTimeOffPolicy(orm, {
    name: "Study leave",
    balance: "unlimited_balance",
  });
  const owner = { termsId: await seed.defaultTermsId(), employeeId: (await seed.employee()).id };

  await expect(
    timeOffPolicyRepository(orm).insertAssignment({
      owner,
      timeOffTypeId: policy.timeOffTypeId,
      timeOffPolicyId: policy.id,
      versionId: policy.versionId,
      startDate: calendarDate("2026-01-01"),
      endDate: null,
    }),
  ).rejects.toMatchObject({ cause: { code: "23514" } });
});

test("the database refuses a policy assignment without an owner", async ({ orm }) => {
  const policy = await seedTimeOffPolicy(orm, {
    name: "Study leave",
    balance: "unlimited_balance",
  });

  await expect(
    timeOffPolicyRepository(orm).insertAssignment({
      // @ts-expect-error The database must also reject invalid runtime input.
      owner: {},
      timeOffTypeId: policy.timeOffTypeId,
      timeOffPolicyId: policy.id,
      versionId: policy.versionId,
      startDate: calendarDate("2026-01-01"),
      endDate: null,
    }),
  ).rejects.toMatchObject({ cause: { code: "23514" } });
});

test("the database refuses a version belonging to another policy", async ({ orm, seed }) => {
  const first = await seedTimeOffPolicy(orm, { name: "Study leave", balance: "unlimited_balance" });
  const second = await seedTimeOffPolicy(orm, {
    name: "Other rules",
    timeOffTypeId: first.timeOffTypeId,
    balance: "unlimited_balance",
  });
  const owner = { termsId: await seed.defaultTermsId() };

  await expect(
    timeOffPolicyRepository(orm).insertAssignment({
      owner,
      timeOffTypeId: first.timeOffTypeId,
      timeOffPolicyId: first.id,
      versionId: second.versionId,
      startDate: calendarDate("2026-01-01"),
      endDate: null,
    }),
  ).rejects.toMatchObject({ cause: { code: "23503" } });
});

test("the database refuses a policy belonging to another type", async ({ orm, seed }) => {
  const first = await seedTimeOffPolicy(orm, { name: "Study leave", balance: "unlimited_balance" });
  const second = await seedTimeOffPolicy(orm, { name: "Moving day", balance: "unlimited_balance" });
  const owner = { termsId: await seed.defaultTermsId() };

  await expect(
    timeOffPolicyRepository(orm).insertAssignment({
      owner,
      timeOffTypeId: second.timeOffTypeId,
      timeOffPolicyId: first.id,
      versionId: first.versionId,
      startDate: calendarDate("2026-01-01"),
      endDate: null,
    }),
  ).rejects.toMatchObject({ cause: { code: "23503" } });
});
