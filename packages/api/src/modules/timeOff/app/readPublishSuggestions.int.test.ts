import {
  ADMIN,
  OWNER,
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

test("publish suggestions include later joiners, excludes leavers and personal rules, and sorts by name", async ({
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
    versionId: named.versionId,
  });
  const service = timeOffPolicyService(orm, { today: "2026-11-06" });

  await service.saveTimeOffPolicy(OWNER, {
    termsId,
    timeOffTypeId,
    rules: { balance: "unlimited_balance" },
  });
  const suggestions = await service.readPublishSuggestions(ADMIN, {
    termsId,
    from: "2026-11-01",
  });

  expect(suggestions.owners[0]!.reached.map(({ id }) => id)).toEqual([
    amyAble.id,
    amyZed.id,
    zoe.id,
  ]);
});

test("offer suggestions include later joiners, excludes leavers and personal rules for that type, and sorts by name", async ({
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
    versionId: named.versionId,
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
    versionId: otherTypePolicy.versionId,
  });

  await service.saveTimeOffPolicy(OWNER, {
    termsId,
    timeOffTypeId,
    rules: { balance: "unlimited_balance" },
  });
  const suggestions = await service.readPublishSuggestions(ADMIN, {
    termsId,
    from: "2026-11-01",
  });

  expect(suggestions.owners[0]!.reached.map(({ id }) => id)).toEqual([
    amyAble.id,
    amyZed.id,
    zoe.id,
  ]);
});

test("an employee cannot read publish suggestions for existing rules", async ({
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
  const service = timeOffPolicyService(orm, { today: "2026-11-06" });

  await expect(
    service.readPublishSuggestions(EMPLOYEE, { termsId, from: "2026-11-01" }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
});

test("an employee cannot read publish suggestions for an offer", async ({ orm, seed }) => {
  const termsId = await seed.defaultTermsId();
  const service = timeOffPolicyService(orm, { today: "2026-11-06" });

  await expect(
    service.readPublishSuggestions(EMPLOYEE, { termsId, from: "2026-11-01" }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
});

test("reading unknown terms' publish suggestions is refused", async ({ orm }) => {
  const service = timeOffPolicyService(orm, { today: "2026-11-06" });

  await expect(
    service.readPublishSuggestions(ADMIN, {
      termsId: "00000000-0000-4000-8000-000000000001",
      from: "2026-11-01",
    }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "termsId", code: "not_found" }],
  });
});
