import {
  ADMIN,
  EMPLOYEE,
  expect,
  giveTermsPolicies,
  seedEmploymentEnd,
  seedTimeOffAssignment,
  seedTimeOffPolicy,
  seedTimeOffType,
  test,
  timeOffPolicyService,
} from "#test/support";
import { timeOffPolicyRepository } from "../db";

test("policy reach includes later joiners, excludes leavers and personal rules, and sorts by name", async ({
  orm,
  seed,
  transact,
}) => {
  const termsId = await seed.defaultTermsId();
  await giveTermsPolicies(orm, transact, {
    termsId,
    policies: [{ key: "uk_20_days_plus_bank_holidays" }],
    today: "2026-11-06",
  });
  const [policy] = await timeOffPolicyRepository(orm).findAll();
  const timeOffTypeId = policy!.timeOffType.id;
  const zoe = await seed.employee({ firstName: "Zoe", lastName: "Able", startDate: "2025-01-01" });
  const amyZed = await seed.employee({
    firstName: "Amy",
    lastName: "Zed",
    startDate: "2026-12-01",
  });
  await seed.moveToTerms(amyZed.id, termsId, "2026-12-01");
  const amyAble = await seed.employee({
    firstName: "Amy",
    lastName: "Able",
    startDate: "2025-01-01",
  });
  const left = await seed.employee({ startDate: "2025-01-01" });
  await seedEmploymentEnd(orm, left.id, "2026-10-31");
  const personal = await seed.employee({ startDate: "2025-01-01" });
  const named = await seedTimeOffPolicy(orm, {
    name: "Personal leave",
    timeOffTypeId,
    balance: "unlimited_balance",
  });
  await seedTimeOffAssignment(orm, {
    employeeId: personal.id,
    timeOffTypeId,
    timeOffPolicyId: named.id,
  });
  const service = timeOffPolicyService(orm, { today: "2026-11-06" });

  const reached = await service.readPolicyReach(ADMIN, {
    timeOffPolicyId: policy!.id,
    from: "2026-11-01",
  });

  expect(reached.map(({ id }) => id)).toEqual([amyAble.id, amyZed.id, zoe.id]);
});

test("offer reach includes later joiners, excludes leavers and personal rules for that type, and sorts by name", async ({
  orm,
  seed,
}) => {
  const termsId = await seed.defaultTermsId();
  const { id: timeOffTypeId } = await seedTimeOffType(orm, "Study leave");
  const zoe = await seed.employee({ firstName: "Zoe", lastName: "Able", startDate: "2025-01-01" });
  const amyZed = await seed.employee({
    firstName: "Amy",
    lastName: "Zed",
    startDate: "2026-12-01",
  });
  await seed.moveToTerms(amyZed.id, termsId, "2026-12-01");
  const amyAble = await seed.employee({
    firstName: "Amy",
    lastName: "Able",
    startDate: "2025-01-01",
  });
  const left = await seed.employee({ startDate: "2025-01-01" });
  await seedEmploymentEnd(orm, left.id, "2026-10-31");
  const personal = await seed.employee({ startDate: "2025-01-01" });
  const named = await seedTimeOffPolicy(orm, {
    name: "Personal leave",
    timeOffTypeId,
    balance: "unlimited_balance",
  });
  await seedTimeOffAssignment(orm, {
    employeeId: personal.id,
    timeOffTypeId,
    timeOffPolicyId: named.id,
  });
  const service = timeOffPolicyService(orm, { today: "2026-11-06" });
  const otherTypePolicy = await seedTimeOffPolicy(orm, {
    name: "Other leave",
    balance: "unlimited_balance",
  });
  await seedTimeOffAssignment(orm, {
    employeeId: amyAble.id,
    timeOffTypeId: otherTypePolicy.timeOffTypeId,
    timeOffPolicyId: otherTypePolicy.id,
  });

  const reached = await service.readOfferReach(ADMIN, {
    termsId,
    timeOffTypeId,
    from: "2026-11-01",
  });

  expect(reached.map(({ id }) => id)).toEqual([amyAble.id, amyZed.id, zoe.id]);
});

test("an employee cannot read policy reach", async ({ orm, seed, transact }) => {
  const termsId = await seed.defaultTermsId();
  await giveTermsPolicies(orm, transact, {
    termsId,
    policies: [{ key: "uk_20_days_plus_bank_holidays" }],
    today: "2026-11-06",
  });
  const [policy] = await timeOffPolicyRepository(orm).findAll();
  const service = timeOffPolicyService(orm, { today: "2026-11-06" });

  await expect(
    service.readPolicyReach(EMPLOYEE, { timeOffPolicyId: policy!.id, from: "2026-11-01" }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
});

test("an employee cannot read offer reach", async ({ orm, seed }) => {
  const termsId = await seed.defaultTermsId();
  const { id: timeOffTypeId } = await seedTimeOffType(orm, "Study leave");
  const service = timeOffPolicyService(orm, { today: "2026-11-06" });

  await expect(
    service.readOfferReach(EMPLOYEE, { termsId, timeOffTypeId, from: "2026-11-01" }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
});

test("reading an unknown policy's reach is refused", async ({ orm }) => {
  const service = timeOffPolicyService(orm, { today: "2026-11-06" });

  await expect(
    service.readPolicyReach(ADMIN, {
      timeOffPolicyId: "00000000-0000-4000-8000-000000000001",
      from: "2026-11-01",
    }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
});
