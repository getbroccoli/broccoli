import {
  EMPLOYEE,
  expect,
  OWNER,
  giveTermsPolicies,
  readAllowances,
  readTermsPolicies,
  seedTimeOffType,
  test,
  timeOffPolicyService,
  timeOffService,
  termsService,
} from "#test/support";
import { timeOffPolicyRepository } from "../db";

test("saving twice updates the same unpublished rules and increments their revision", async ({
  orm,
  seed,
}) => {
  const termsId = await seed.defaultTermsId();
  const type = await seedTimeOffType(orm, "Study leave");
  const service = timeOffPolicyService(orm);
  const first = await service.saveTimeOffPolicy(OWNER, {
    termsId,
    timeOffTypeId: type.id,
    rules: { balance: "no_balance" },
  });

  const second = await service.saveTimeOffPolicy(OWNER, {
    termsId,
    timeOffTypeId: type.id,
    rules: { balance: "unlimited_balance" },
  });

  expect(second).toMatchObject({
    id: first.id,
    timeOffPolicyId: first.timeOffPolicyId,
    termsId,
    status: "draft",
    revision: 2,
    balance: "unlimited_balance",
  });
  expect((await timeOffPolicyRepository(orm).findAll())[0]!.versions).toEqual([second]);
});

test("saving and discarding rules leave allowances, applicable rules and history unchanged", async ({
  orm,
  seed,
  transact,
}) => {
  const employee = await seed.employee({ startDate: "2025-01-01" });
  const termsId = await seed.defaultTermsId();
  await giveTermsPolicies(orm, transact, {
    termsId,
    policies: [{ key: "uk_20_days_plus_bank_holidays" }],
  });
  const [policy] = await readTermsPolicies(orm, termsId);
  const service = timeOffPolicyService(orm);
  const timeOff = timeOffService(orm);
  const history = termsService(orm);
  const before = await readAllowances(orm, employee.id);
  const rules = await timeOff.readPersonTimeOff(OWNER, { employeeIds: [employee.id] });
  const lines = await history.readTermsHistory(OWNER, termsId, {});

  const draft = await service.saveTimeOffPolicy(OWNER, {
    termsId,
    timeOffTypeId: policy!.timeOffTypeId,
    rules: { balance: "unlimited_balance" },
  });

  expect(await readAllowances(orm, employee.id)).toEqual(before);
  expect(await timeOff.readPersonTimeOff(OWNER, { employeeIds: [employee.id] })).toEqual(rules);
  expect(await history.readTermsHistory(OWNER, termsId, {})).toEqual(lines);

  await service.discardTimeOffPolicy(OWNER, { versionId: draft.id });

  expect(await readAllowances(orm, employee.id)).toEqual(before);
  expect(await timeOff.readPersonTimeOff(OWNER, { employeeIds: [employee.id] })).toEqual(rules);
  expect(await history.readTermsHistory(OWNER, termsId, {})).toEqual(lines);
});

test("discarding an unpublished offer removes the empty policy", async ({ orm, seed }) => {
  const termsId = await seed.defaultTermsId();
  const type = await seedTimeOffType(orm, "Study leave");
  const service = timeOffPolicyService(orm);
  const draft = await service.saveTimeOffPolicy(OWNER, {
    termsId,
    timeOffTypeId: type.id,
    rules: { balance: "no_balance" },
  });

  await service.discardTimeOffPolicy(OWNER, { versionId: draft.id });

  expect(await timeOffPolicyRepository(orm).findAll()).toEqual([]);
});

test("terms sharing a policy save separate unpublished rules", async ({ orm, seed, transact }) => {
  const termsId = await seed.defaultTermsId();
  const otherTermsId = await seed.terms("Other terms");
  await giveTermsPolicies(orm, transact, {
    termsId,
    policies: [{ key: "uk_20_days_plus_bank_holidays" }],
  });
  const repository = timeOffPolicyRepository(orm);
  const [assignment] = await repository.findAssignments({ termsIds: [termsId] });
  await repository.insertAssignment({
    timeOffTypeId: assignment!.timeOffTypeId,
    timeOffPolicyId: assignment!.timeOffPolicyId,
    versionId: assignment!.versionId,
    startDate: assignment!.startDate,
    endDate: assignment!.endDate,
    owner: { termsId: otherTermsId },
  });
  const service = timeOffPolicyService(orm);

  const first = await service.saveTimeOffPolicy(OWNER, {
    termsId,
    timeOffTypeId: assignment!.timeOffTypeId,
    rules: { balance: "no_balance" },
  });
  const second = await service.saveTimeOffPolicy(OWNER, {
    termsId: otherTermsId,
    timeOffTypeId: assignment!.timeOffTypeId,
    rules: { balance: "unlimited_balance" },
  });

  expect(second.id).not.toBe(first.id);
  expect(first).toMatchObject({
    termsId,
    timeOffPolicyId: assignment!.timeOffPolicyId,
    revision: 1,
  });
  expect(second).toMatchObject({
    termsId: otherTermsId,
    timeOffPolicyId: first.timeOffPolicyId,
    revision: 1,
  });
});

test("saving after publication leaves the published settings intact", async ({ orm, seed }) => {
  const termsId = await seed.defaultTermsId();
  const type = await seedTimeOffType(orm, "Study leave");
  const service = timeOffPolicyService(orm);
  const first = await service.saveTimeOffPolicy(OWNER, {
    termsId,
    timeOffTypeId: type.id,
    rules: { balance: "no_balance" },
  });
  await service.publishTerms(OWNER, {
    termsId,
    versions: [first],
    startDate: "2026-01-01",
    owners: [{ termsId }],
  });
  const published = (await timeOffPolicyRepository(orm).findAll())[0]!.versions[0];

  const second = await service.saveTimeOffPolicy(OWNER, {
    termsId,
    timeOffTypeId: type.id,
    rules: { balance: "unlimited_balance" },
  });

  expect(second.id).not.toBe(first.id);
  expect(second.revision).toBe(1);
  expect((await timeOffPolicyRepository(orm).findAll())[0]!.versions).toContainEqual(published);
});

test("a published version cannot be discarded", async ({ orm, seed, transact }) => {
  const termsId = await seed.defaultTermsId();
  await giveTermsPolicies(orm, transact, {
    termsId,
    policies: [{ key: "uk_20_days_plus_bank_holidays" }],
  });
  const [policy] = await readTermsPolicies(orm, termsId);

  await expect(
    timeOffPolicyService(orm).discardTimeOffPolicy(OWNER, { versionId: policy!.versionId }),
  ).rejects.toMatchObject({
    code: "NOT_FOUND",
    message: "No unpublished time off rules have this id.",
  });
});

test("an employee cannot discard unpublished rules", async ({ orm, seed }) => {
  const termsId = await seed.defaultTermsId();
  const type = await seedTimeOffType(orm, "Study leave");
  const service = timeOffPolicyService(orm);
  const draft = await service.saveTimeOffPolicy(OWNER, {
    termsId,
    timeOffTypeId: type.id,
    rules: { balance: "no_balance" },
  });

  await expect(
    service.discardTimeOffPolicy(EMPLOYEE, { versionId: draft.id }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect((await timeOffPolicyRepository(orm).findAll())[0]!.versions).toContainEqual(draft);
});
