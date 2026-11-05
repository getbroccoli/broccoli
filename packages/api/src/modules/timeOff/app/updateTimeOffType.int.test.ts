import { eq } from "drizzle-orm";

import {
  ADMIN,
  EMPLOYEE,
  expect,
  recordHistory,
  seedLinkedTimeOffPolicy,
  seedTimeOffPolicy,
  seedTimeOffType,
  test,
  timeOffService,
} from "#test/support";

import { allowanceLedgerLines, timeOffAllowanceRules, timeOffPolicies, timeOffTypes } from "../db";

test("renames the type, changes its icon and colour, and writes one history line", async ({
  orm,
}) => {
  const type = await seedTimeOffType(orm, "Holiday");
  const service = timeOffService(orm);

  const result = await service.updateTimeOffType(ADMIN, {
    id: type.id,
    name: "Company leave",
    icon: "umbrella",
    colour: "blue",
  });

  expect(result).toMatchObject({
    timeOffType: {
      timeOffType: { id: type.id, name: "Company leave", icon: "umbrella", colour: "blue" },
    },
    allowancesUpdated: 0,
  });
  const { edges } = await recordHistory.read(orm, "time_off_type", type.id, {});
  expect(edges).toHaveLength(1);
  expect(edges[0]!.node).toMatchObject({
    operation: "UPDATED",
    cause: { kind: "EDITED_DIRECTLY" },
  });
  expect(edges[0]!.node.changes).toEqual([
    { field: "name", oldValue: "Holiday", newValue: "Company leave" },
    { field: "icon", oldValue: null, newValue: "umbrella" },
    { field: "colour", oldValue: null, newValue: "blue" },
  ]);
});

test("refuses Sickness's reason being shown", async ({ orm }) => {
  const [sickness] = await orm
    .select()
    .from(timeOffTypes)
    .where(eq(timeOffTypes.typeKey, "sickness"));

  await expect(
    timeOffService(orm).updateTimeOffType(ADMIN, {
      id: sickness!.id,
      reasonVisibleToColleagues: true,
    }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "reasonVisibleToColleagues", code: "invalid" }],
  });
});

test("changes how an unused policy counts", async ({ orm }) => {
  const policy = await seedTimeOffPolicy(orm, { name: "Wellbeing", balance: "unlimited_balance" });

  const result = await timeOffService(orm).updateTimeOffType(ADMIN, {
    id: policy.timeOffTypeId,
    policies: [
      {
        id: policy.id,
        balance: "balance_from_allowance",
        allowanceDays: 5,
        bankHolidays: "bank_holidays_on_top_of_allowance",
      },
    ],
  });

  expect(result.timeOffType.policies).toMatchObject([
    {
      id: policy.id,
      balance: "balance_from_allowance",
      allowance: { days: 5, bankHolidays: "bank_holidays_on_top_of_allowance" },
    },
  ]);
  expect(result.allowancesUpdated).toBe(0);
});

test("refuses changing how a used policy counts with CONFLICT", async ({ orm, seed, transact }) => {
  const { service, policy } = await seedLinkedTimeOffPolicy(orm, seed, transact);

  await expect(
    service.updateTimeOffType(ADMIN, {
      id: policy.timeOffTypeId,
      policies: [{ id: policy.id, balance: "unlimited_balance" }],
    }),
  ).rejects.toMatchObject({
    code: "CONFLICT",
    message: "This policy is in use, so how it counts can't change.",
  });
});

test("adds a policy nobody is on; appends no ledger lines", async ({ orm }) => {
  const type = await seedTimeOffType(orm, "Wellbeing");
  const before = await orm.select().from(allowanceLedgerLines);

  const result = await timeOffService(orm).updateTimeOffType(ADMIN, {
    id: type.id,
    addPolicies: [
      {
        name: "Five days",
        balance: "balance_from_allowance",
        allowanceDays: 5,
        bankHolidays: "bank_holidays_on_top_of_allowance",
      },
    ],
  });

  expect(result).toMatchObject({
    allowancesUpdated: 0,
    timeOffType: {
      policies: [
        {
          name: "Five days",
          standard: false,
          peopleCount: 0,
          ownAssignmentCount: 0,
          terms: [],
          everUsed: false,
          allowance: { days: 5 },
        },
      ],
    },
  });
  expect(await orm.select().from(allowanceLedgerLines)).toEqual(before);
});

test("deletes an unused policy and its rules", async ({ orm }) => {
  const policy = await seedTimeOffPolicy(orm, {
    name: "Wellbeing",
    balance: "balance_from_allowance",
    entitlementDays: 5,
  });

  const result = await timeOffService(orm).updateTimeOffType(ADMIN, {
    id: policy.timeOffTypeId,
    deletePolicyIds: [policy.id],
  });

  expect(result.timeOffType.policies).toEqual([]);
  expect(await orm.select().from(timeOffPolicies).where(eq(timeOffPolicies.id, policy.id))).toEqual(
    [],
  );
  expect(
    await orm
      .select()
      .from(timeOffAllowanceRules)
      .where(eq(timeOffAllowanceRules.timeOffPolicyId, policy.id)),
  ).toEqual([]);
});

test("refuses deleting a used policy with CONFLICT and changes nothing else in the save", async ({
  orm,
  seed,
  transact,
}) => {
  const { service, policy } = await seedLinkedTimeOffPolicy(orm, seed, transact);
  const before = await service.readTimeOffTypeSettings(ADMIN, { id: policy.timeOffTypeId });
  const lines = await orm.select().from(allowanceLedgerLines);

  await expect(
    service.updateTimeOffType(ADMIN, {
      id: policy.timeOffTypeId,
      name: "Renamed",
      deletePolicyIds: [policy.id],
    }),
  ).rejects.toMatchObject({
    code: "CONFLICT",
    message: "This policy is in use, so it can't be deleted.",
  });

  expect(await service.readTimeOffTypeSettings(ADMIN, { id: policy.timeOffTypeId })).toEqual(
    before,
  );
  expect(await orm.select().from(allowanceLedgerLines)).toEqual(lines);
  expect((await recordHistory.read(orm, "time_off_type", policy.timeOffTypeId, {})).edges).toEqual(
    [],
  );
});

test("a duplicate type name ignoring case is a field error", async ({ orm }) => {
  const type = await seedTimeOffType(orm, "Wellbeing");

  await expect(
    timeOffService(orm).updateTimeOffType(ADMIN, { id: type.id, name: "ANNUAL LEAVE" }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "name", code: "taken" }],
  });
});

test("a duplicate policy name ignoring case is a field error", async ({ orm }) => {
  const policy = await seedTimeOffPolicy(orm, {
    name: "Five days",
    balance: "balance_from_allowance",
    entitlementDays: 5,
  });
  const second = await seedTimeOffPolicy(orm, {
    name: "Ten days",
    timeOffTypeId: policy.timeOffTypeId,
    balance: "balance_from_allowance",
    entitlementDays: 10,
  });

  await expect(
    timeOffService(orm).updateTimeOffType(ADMIN, {
      id: policy.timeOffTypeId,
      policies: [{ id: second.id, name: "FIVE DAYS" }],
    }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "policies.0.name", code: "taken" }],
  });
});

test("refuses someone without MANAGE_WORKSPACE", async ({ orm }) => {
  const type = await seedTimeOffType(orm, "Wellbeing");
  await expect(
    timeOffService(orm).updateTimeOffType(EMPLOYEE, { id: type.id, name: "Renamed" }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
});

test("policies can swap names in one save", async ({ orm }) => {
  const a = await seedTimeOffPolicy(orm, { name: "A", balance: "unlimited_balance" });
  const b = await seedTimeOffPolicy(orm, {
    name: "B",
    timeOffTypeId: a.timeOffTypeId,
    balance: "unlimited_balance",
  });

  const result = await timeOffService(orm).updateTimeOffType(ADMIN, {
    id: a.timeOffTypeId,
    policies: [
      { id: a.id, name: "B" },
      { id: b.id, name: "C" },
    ],
  });

  expect(result.timeOffType.policies.map(({ name }) => name).sort()).toEqual(["B", "C"]);
});

test("the same policy twice in one save is refused", async ({ orm }) => {
  const policy = await seedTimeOffPolicy(orm, { name: "A", balance: "unlimited_balance" });

  await expect(
    timeOffService(orm).updateTimeOffType(ADMIN, {
      id: policy.timeOffTypeId,
      policies: [
        { id: policy.id, name: "X" },
        { id: policy.id, name: "Y" },
      ],
    }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "policies.1.id", code: "invalid" }],
  });
});
