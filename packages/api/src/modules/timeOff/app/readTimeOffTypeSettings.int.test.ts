import { eq } from "drizzle-orm";

import {
  ADMIN,
  EMPLOYEE,
  calendarDate,
  expect,
  linkStatutoryMinimumToDefaultTerms,
  seedTimeOffAssignment,
  seedTimeOffPolicy,
  seedTimeOffType,
  test,
  timeOffService,
} from "#test/support";

import { allowances, termsTimeOffPolicies, timeOffTypes } from "../db";

test("reads Annual leave with its three standard policies, the linked one first", async ({
  orm,
  seed,
  transact,
}) => {
  await seed.employee({ startDate: "2025-01-01" });
  await seed.employee({ startDate: "2025-01-01" });
  await linkStatutoryMinimumToDefaultTerms(orm, seed, transact);
  const [annual] = await orm
    .select()
    .from(timeOffTypes)
    .where(eq(timeOffTypes.typeKey, "annual_leave"));

  const result = await timeOffService(orm, { today: "2026-11-05" }).readTimeOffTypeSettings(ADMIN, {
    id: annual!.id,
  });

  expect(result!.policies).toMatchObject([
    {
      name: "UK statutory minimum",
      standard: true,
      peopleCount: 2,
      everUsed: true,
      allowance: {
        days: 28,
        daysPerWeek: 5,
        maxDays: 28,
        bankHolidays: "bank_holidays_included_in_allowance",
      },
      terms: [{ id: await seed.defaultTermsId(), name: "England and Wales" }],
    },
    {
      name: "20 days plus bank holidays",
      standard: true,
      peopleCount: 0,
      everUsed: false,
      terms: [],
    },
    {
      name: "25 days plus bank holidays",
      standard: true,
      peopleCount: 0,
      everUsed: false,
      terms: [],
    },
  ]);
});

test("counts a person on the policy on their own once", async ({ orm, seed, transact }) => {
  const member = await seed.employee({ startDate: "2025-01-01" });
  const nonMember = await seed.employee({ startDate: "2025-01-01" });
  await seed.leaveTerms(nonMember.id);
  await linkStatutoryMinimumToDefaultTerms(orm, seed, transact);
  const service = timeOffService(orm, { today: "2026-11-05" });
  const annual = (await service.listTimeOffTypes(ADMIN)).timeOffTypes.find(
    ({ timeOffType }) => timeOffType.typeKey === "annual_leave",
  )!;
  const policy = (await service.listPolicies(ADMIN, orm)).find(
    ({ key }) => key === "uk_statutory_minimum",
  )!;
  await seedTimeOffAssignment(orm, {
    employeeId: nonMember.id,
    timeOffTypeId: annual.timeOffType.id,
    timeOffPolicyId: policy.id,
  });
  const withOwnAssignment = await service.readTimeOffTypeSettings(ADMIN, {
    id: annual.timeOffType.id,
  });
  expect(withOwnAssignment!.policies.find(({ id }) => id === policy.id)).toMatchObject({
    peopleCount: 2,
    ownAssignmentCount: 1,
  });
  await seedTimeOffAssignment(orm, {
    employeeId: member.id,
    timeOffTypeId: annual.timeOffType.id,
    timeOffPolicyId: policy.id,
  });

  const result = await service.readTimeOffTypeSettings(ADMIN, { id: annual.timeOffType.id });

  expect(result!.policies.find(({ id }) => id === policy.id)).toMatchObject({ peopleCount: 2 });
});

test("a policy linked earlier and unlinked since is ever used but has no terms today", async ({
  orm,
  seed,
  transact,
}) => {
  await linkStatutoryMinimumToDefaultTerms(orm, seed, transact);
  const [link] = await orm.select().from(termsTimeOffPolicies);
  await orm.update(termsTimeOffPolicies).set({ effectiveUntil: calendarDate("2026-06-30") });

  const result = await timeOffService(orm, { today: "2026-11-05" }).readTimeOffTypeSettings(ADMIN, {
    id: link!.timeOffTypeId,
  });

  expect(result!.policies.find(({ id }) => id === link!.timeOffPolicyId)).toMatchObject({
    everUsed: true,
    terms: [],
    peopleCount: 0,
  });
});

test("a seeded type cannot be deleted; an unused own type can; an own type with an allowance cannot", async ({
  orm,
  seed,
}) => {
  const service = timeOffService(orm, { today: "2026-11-05" });
  const [seeded] = await orm.select().from(timeOffTypes);
  const unused = await seedTimeOffType(orm, "Moving day");
  const used = await seedTimeOffPolicy(orm, {
    name: "Wellbeing",
    balance: "balance_from_allowance",
    entitlementDays: 2,
  });
  const employee = await seed.employee();
  await orm.insert(allowances).values({
    employeeId: employee.id,
    timeOffTypeId: used.timeOffTypeId,
    leaveYearStart: calendarDate("2025-01-01"),
    leaveYearEnd: calendarDate("2025-12-31"),
  });

  expect(await service.readTimeOffTypeSettings(ADMIN, { id: seeded!.id })).toMatchObject({
    canDelete: false,
  });
  expect(await service.readTimeOffTypeSettings(ADMIN, { id: unused.id })).toMatchObject({
    canDelete: true,
  });
  expect(await service.readTimeOffTypeSettings(ADMIN, { id: used.timeOffTypeId })).toMatchObject({
    canDelete: false,
  });
});

test("returns null for an unknown id", async ({ orm }) => {
  expect(
    await timeOffService(orm).readTimeOffTypeSettings(ADMIN, { id: crypto.randomUUID() }),
  ).toBeNull();
});

test("refuses someone without MANAGE_WORKSPACE", async ({ orm }) => {
  const type = await seedTimeOffType(orm, "Moving day");
  await expect(
    timeOffService(orm).readTimeOffTypeSettings(EMPLOYEE, { id: type.id }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
});
