import { eq, sql } from "drizzle-orm";

import {
  ADMIN,
  EMPLOYEE,
  calendarDate,
  expect,
  expectBlockedBy,
  seedTimeOff,
  seedTimeOffPolicy,
  seedTimeOffType,
  test,
  timeOffService,
} from "#test/support";

import { ormOf } from "../../../core/db";
import { createRecordHistoryReaderService } from "../../../core/records";
import {
  allowances,
  timeOffAllowanceRules,
  timeOffPolicies,
  timeOffPolicyRepository,
  timeOffTypes,
} from "../db";
import { timeOffTypeRecordType } from "./timeOffTypeRecordType";

test("deletes an unused own type with its policies and rules", async ({ orm }) => {
  const policy = await seedTimeOffPolicy(orm, {
    name: "Wellbeing",
    balance: "balance_from_allowance",
    entitlementDays: 5,
  });
  const service = timeOffService(orm);

  expect(await service.deleteTimeOffType(ADMIN, { id: policy.timeOffTypeId })).toEqual({
    id: policy.timeOffTypeId,
  });

  expect(await service.readTimeOffTypeSettings(ADMIN, { id: policy.timeOffTypeId })).toBeNull();
  expect(
    await orm
      .select()
      .from(timeOffPolicies)
      .where(eq(timeOffPolicies.timeOffTypeId, policy.timeOffTypeId)),
  ).toEqual([]);
  expect(
    await orm
      .select()
      .from(timeOffAllowanceRules)
      .where(eq(timeOffAllowanceRules.timeOffPolicyId, policy.id)),
  ).toEqual([]);
});

test("refuses a seeded type", async ({ orm }) => {
  const [type] = await orm
    .select()
    .from(timeOffTypes)
    .where(eq(timeOffTypes.typeKey, "annual_leave"));

  await expect(
    timeOffService(orm).deleteTimeOffType(ADMIN, { id: type!.id }),
  ).rejects.toMatchObject({
    code: "CONFLICT",
    message: "Broccoli's own time off types can't be deleted.",
  });
});

test("refuses a type with an allowance", async ({ orm, seed }) => {
  const type = await seedTimeOffType(orm, "Wellbeing");
  const employee = await seed.employee();
  await orm.insert(allowances).values({
    employeeId: employee.id,
    timeOffTypeId: type.id,
    leaveYearStart: calendarDate("2025-01-01"),
    leaveYearEnd: calendarDate("2025-12-31"),
  });

  await expect(timeOffService(orm).deleteTimeOffType(ADMIN, { id: type.id })).rejects.toMatchObject(
    {
      code: "CONFLICT",
      message: "This time off type has been used, so it can't be deleted.",
    },
  );
});

test("refuses a type with time off", async ({ orm, seed }) => {
  const type = await seedTimeOffType(orm, "Moving day");
  const employee = await seed.employee();
  await seedTimeOff(orm, {
    employeeId: employee.id,
    timeOffTypeId: type.id,
    status: "approved",
    days: [{ date: "2025-06-02", dayPart: "full_day" }],
  });

  await expect(timeOffService(orm).deleteTimeOffType(ADMIN, { id: type.id })).rejects.toMatchObject(
    {
      code: "CONFLICT",
      message: "This time off type has been used, so it can't be deleted.",
    },
  );
});

test("refuses a type whose policy was linked to terms meanwhile", async ({
  orm,
  seed,
  transact,
}) => {
  const policy = await seedTimeOffPolicy(orm, {
    name: "Wellbeing",
    balance: "balance_from_allowance",
    entitlementDays: 5,
  });
  const service = timeOffService(orm);
  expect(await service.readTimeOffTypeSettings(ADMIN, { id: policy.timeOffTypeId })).toMatchObject({
    canDelete: true,
  });
  const termsId = await seed.defaultTermsId();
  const ready = Promise.withResolvers<number>();
  const release = Promise.withResolvers<void>();
  const linking = transact(async (tx) => {
    const repository = timeOffPolicyRepository(tx);
    await repository.lockTermsLinks();
    await repository.insertTermsLinks(termsId, [
      { timeOffTypeId: policy.timeOffTypeId, timeOffPolicyId: policy.id },
    ]);
    const { rows } = await ormOf(tx).execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
    ready.resolve(rows[0]!.pid);
    await release.promise;
  });
  const blockingPid = await ready.promise;
  const results = Promise.allSettled([
    linking,
    Promise.resolve().then(() => service.deleteTimeOffType(ADMIN, { id: policy.timeOffTypeId })),
  ]);
  try {
    await expectBlockedBy(orm, blockingPid);
  } finally {
    release.resolve();
    await results;
  }

  expect(await results).toMatchObject([
    { status: "fulfilled" },
    {
      status: "rejected",
      reason: {
        code: "CONFLICT",
        message: "This time off type has been used, so it can't be deleted.",
      },
    },
  ]);
  expect(await service.readTimeOffTypeSettings(ADMIN, { id: policy.timeOffTypeId })).toMatchObject({
    canDelete: false,
    policies: [{ id: policy.id }],
  });
  expect(
    await orm
      .select()
      .from(timeOffAllowanceRules)
      .where(eq(timeOffAllowanceRules.timeOffPolicyId, policy.id)),
  ).toHaveLength(1);
});

test("its history stays readable with a deleted line", async ({ orm }) => {
  const type = await seedTimeOffType(orm, "Wellbeing");
  const service = timeOffService(orm);
  await service.updateTimeOffType(ADMIN, { id: type.id, name: "Company leave" });
  const history = createRecordHistoryReaderService(orm, {
    time_off_type: timeOffTypeRecordType(orm),
  });
  const before = await history.readHistory(ADMIN, "time_off_type", type.id, {});

  await service.deleteTimeOffType(ADMIN, { id: type.id });

  const { edges } = await history.readHistory(ADMIN, "time_off_type", type.id, {});
  expect(edges).toHaveLength(before.edges.length + 1);
  expect(edges[0]!.node).toMatchObject({ recordId: type.id, operation: "DELETED" });
  expect(edges.slice(1)).toEqual(before.edges);
});

test("refuses someone without MANAGE_WORKSPACE", async ({ orm }) => {
  const type = await seedTimeOffType(orm, "Wellbeing");
  await expect(
    timeOffService(orm).deleteTimeOffType(EMPLOYEE, { id: type.id }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
});
