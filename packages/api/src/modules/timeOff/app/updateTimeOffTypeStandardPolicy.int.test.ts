import { eq } from "drizzle-orm";

import { ADMIN, expect, test, timeOffService } from "#test/support";
import type { TestSeed } from "#test/support";

import type { Orm, Transact } from "../../../core/db";
import {
  termsTimeOffPolicies,
  timeOffAllowanceRules,
  timeOffPolicies,
  timeOffPolicyRepository,
} from "../db";

test("editing a standard policy keeps its id and links, drops its key and takes the new name", async ({
  orm,
  seed,
  transact,
}) => {
  const { service, policy } = await linkedStandard(orm, seed, transact);
  const links = await orm.select().from(termsTimeOffPolicies);

  const result = await service.updateTimeOffType(ADMIN, {
    id: policy.timeOffType.id,
    policies: [{ id: policy.id, name: "22 days plus bank holidays", allowanceDays: 22 }],
  });

  expect(result.timeOffType.policies.find(({ id }) => id === policy.id)).toMatchObject({
    id: policy.id,
    name: "22 days plus bank holidays",
    standard: false,
    allowance: { days: 22 },
  });
  expect(
    await orm.select().from(timeOffPolicies).where(eq(timeOffPolicies.id, policy.id)),
  ).toMatchObject([{ key: null }]);
  expect(await orm.select().from(termsTimeOffPolicies)).toEqual(links);
});

test("a fresh standard copy with the original key is linked to nobody", async ({
  orm,
  seed,
  transact,
}) => {
  const { service, policy } = await linkedStandard(orm, seed, transact);

  const result = await service.updateTimeOffType(ADMIN, {
    id: policy.timeOffType.id,
    policies: [{ id: policy.id, name: "22 days plus bank holidays", allowanceDays: 22 }],
  });

  const copy = (await timeOffPolicyRepository(orm).findAll()).find(
    ({ key }) => key === policy.key,
  )!;
  expect(copy.id).not.toBe(policy.id);
  expect(copy).toMatchObject({
    name: policy.name,
    key: policy.key,
    balance: policy.balance,
    bankHolidays: policy.bankHolidays,
    leaveYear: policy.leaveYear,
  });
  expect(copy.rules).toEqual(
    policy.rules.map((rule) => ({ ...rule, id: expect.any(String) as unknown })),
  );
  expect(result.timeOffType.policies.find(({ id }) => id === copy.id)).toMatchObject({
    standard: true,
    terms: [],
    peopleCount: 0,
    ownAssignmentCount: 0,
    everUsed: false,
  });
});

test("turning time off on after a reset finds the standard by key", async ({
  orm,
  seed,
  transact,
}) => {
  const { service, policy } = await linkedStandard(orm, seed, transact);
  await service.updateTimeOffType(ADMIN, {
    id: policy.timeOffType.id,
    policies: [{ id: policy.id, name: "22 days plus bank holidays", allowanceDays: 22 }],
  });
  await transact((tx) => service.deleteAllTermsPolicies(ADMIN, tx));
  const standard = (await service.listPolicies(ADMIN, orm)).find(({ key }) => key === policy.key)!;

  const result = await transact((tx) =>
    service.turnOnTimeOff(ADMIN, tx, {
      terms: [
        {
          bankHolidayCalendar: "england_and_wales",
          workingWeek: "monday_to_friday_7_5_hours",
          annualLeavePolicyId: standard.id,
        },
      ],
      locationTerms: [],
    }),
  );

  const linked = await service.readTermsPolicies(ADMIN, { termsId: result.termsIds[0]! });
  expect(linked.find(({ typeKey }) => typeKey === "annual_leave")).toMatchObject({
    id: standard.id,
    key: "uk_20_days_plus_bank_holidays",
    name: "20 days plus bank holidays",
  });
  expect(linked.some(({ id }) => id === policy.id)).toBe(false);
});

test("editing it again creates no second copy", async ({ orm, seed, transact }) => {
  const { service, policy } = await linkedStandard(orm, seed, transact);
  await service.updateTimeOffType(ADMIN, {
    id: policy.timeOffType.id,
    policies: [{ id: policy.id, name: "22 days plus bank holidays", allowanceDays: 22 }],
  });
  const standard = (await service.listPolicies(ADMIN, orm)).find(({ key }) => key === policy.key)!;
  const before = await orm.select().from(timeOffPolicies);

  await service.updateTimeOffType(ADMIN, {
    id: policy.timeOffType.id,
    policies: [{ id: policy.id, name: "23 days plus bank holidays", allowanceDays: 23 }],
  });

  expect(await orm.select().from(timeOffPolicies)).toHaveLength(before.length);
  expect((await service.listPolicies(ADMIN, orm)).filter(({ key }) => key === policy.key)).toEqual([
    standard,
  ]);
});

test("renaming a standard policy without changing its values keeps it standard", async ({
  orm,
  seed,
  transact,
}) => {
  const { service, policy } = await linkedStandard(orm, seed, transact);
  const before = await orm.select().from(timeOffPolicies);
  const rules = await orm.select().from(timeOffAllowanceRules);

  const result = await service.updateTimeOffType(ADMIN, {
    id: policy.timeOffType.id,
    policies: [{ id: policy.id, name: "Company standard" }],
  });

  expect(result.timeOffType.policies.find(({ id }) => id === policy.id)).toMatchObject({
    name: "Company standard",
    standard: true,
  });
  expect(
    (await service.listPolicies(ADMIN, orm)).find(({ key }) => key === policy.key),
  ).toMatchObject({ id: policy.id, name: "Company standard" });
  expect(await orm.select().from(timeOffPolicies)).toHaveLength(before.length);
  expect(await orm.select().from(timeOffAllowanceRules)).toEqual(rules);
});

async function linkedStandard(orm: Orm, seed: TestSeed, transact: Transact) {
  await seed.employee({ startDate: "2025-01-01" });
  const service = timeOffService(orm, { today: "2026-11-05" });
  const policy = (await timeOffPolicyRepository(orm).findAll()).find(
    ({ key }) => key === "uk_20_days_plus_bank_holidays",
  )!;
  const termsId = await seed.defaultTermsId();
  await transact((tx) =>
    service.linkTermsPolicies(ADMIN, tx, { termsId, timeOffPolicyIds: [policy.id] }),
  );
  return { service, policy };
}

test("renaming an edited standard policy to its own name in other case is a field error", async ({
  orm,
  seed,
  transact,
}) => {
  const { service, policy } = await linkedStandard(orm, seed, transact);

  await expect(
    service.updateTimeOffType(ADMIN, {
      id: policy.timeOffType.id,
      policies: [{ id: policy.id, name: "20 DAYS PLUS BANK HOLIDAYS", allowanceDays: 22 }],
    }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "policies.0.name", code: "taken" }],
  });
});

test("an edited standard policy that keeps its name is refused, as the standard copy keeps it", async ({
  orm,
  seed,
  transact,
}) => {
  const { service, policy } = await linkedStandard(orm, seed, transact);

  await expect(
    service.updateTimeOffType(ADMIN, {
      id: policy.timeOffType.id,
      policies: [{ id: policy.id, allowanceDays: 22 }],
    }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "policies.0.name", code: "taken" }],
  });
});

test("a new policy cannot take the name the standard copy keeps", async ({
  orm,
  seed,
  transact,
}) => {
  const { service, policy } = await linkedStandard(orm, seed, transact);

  await expect(
    service.updateTimeOffType(ADMIN, {
      id: policy.timeOffType.id,
      policies: [{ id: policy.id, name: "22 days plus bank holidays", allowanceDays: 22 }],
      addPolicies: [{ name: "20 days plus bank holidays", balance: "unlimited_balance" }],
    }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "addPolicies.0.name", code: "taken" }],
  });
});
