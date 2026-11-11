import {
  termsService,
  recordHistory,
  seedTimeOffAssignment,
  expect,
  OWNER,
  giveTermsPolicies,
  seedTimeOffType,
  test,
  timeOffPolicyService,
} from "#test/support";
import { timeOffPolicyRepository } from "../db";

test("changing rules writes one terms history line with both dated settings and the type's name", async ({
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
  const service = timeOffPolicyService(orm, { today: "2026-11-06" });
  const history = termsService(orm, { today: "2026-11-06" });

  const draft1 = await service.saveTimeOffPolicy(OWNER, {
    termsId,
    timeOffTypeId: policy!.timeOffType.id,
    rules: {
      balance: "balance_from_allowance",
      entitlementDays: 22,
      bankHolidays: "bank_holidays_on_top_of_allowance",
    },
  });
  await service.publishTerms(OWNER, {
    termsId,
    versions: [draft1],
    startDate: "2026-01-01",
    owners: [{ termsId }],
  });

  const page = await history.readTermsHistory(OWNER, termsId, {});
  expect(page.edges).toHaveLength(1);
  const line = page.edges[0]!.node;
  expect(line).toMatchObject({
    recordType: "terms",
    recordId: termsId,
    operation: "UPDATED",
    cause: { kind: "EDITED_DIRECTLY" },
  });
  expect(line.changes).toHaveLength(1);
  expect(line.changes[0]).toMatchObject({
    field: `timeOff.${policy!.timeOffType.id}`,
    newLabel: "Annual leave",
  });
  expect(JSON.parse(line.changes[0]!.oldValue!)).toEqual({
    startDate: "2026-01-01",
    balance: "balance_from_allowance",
    entitlementDays: 20,
    bankHolidays: "bank_holidays_on_top_of_allowance",
  });
  expect(JSON.parse(line.changes[0]!.newValue!)).toEqual({
    startDate: "2026-01-01",
    balance: "balance_from_allowance",
    entitlementDays: 22,
    bankHolidays: "bank_holidays_on_top_of_allowance",
  });
});

test("offering a type writes one terms history line with no old settings", async ({
  orm,
  seed,
}) => {
  const termsId = await seed.defaultTermsId();
  const type = await seedTimeOffType(orm, "Study leave");
  const service = timeOffPolicyService(orm, { today: "2026-11-06" });
  const history = termsService(orm, { today: "2026-11-06" });

  const draft2 = await service.saveTimeOffPolicy(OWNER, {
    termsId,
    timeOffTypeId: type.id,
    rules: { balance: "no_balance" },
  });
  await service.publishTerms(OWNER, {
    termsId,
    versions: [draft2],
    startDate: "2026-07-01",
    owners: [{ termsId }],
  });

  const page = await history.readTermsHistory(OWNER, termsId, {});
  expect(page.edges).toHaveLength(1);
  const line = page.edges[0]!.node;
  expect(line).toMatchObject({
    recordType: "terms",
    recordId: termsId,
    operation: "UPDATED",
    cause: { kind: "EDITED_DIRECTLY" },
  });
  expect(line.changes).toHaveLength(1);
  expect(line.changes[0]).toMatchObject({
    field: `timeOff.${type.id}`,
    newLabel: "Study leave",
    oldValue: null,
  });
  expect(JSON.parse(line.changes[0]!.newValue!)).toEqual({
    startDate: "2026-07-01",
    balance: "no_balance",
    entitlementDays: null,
    bankHolidays: null,
  });
});

test("cancelling planned rules writes one terms history line with the cancelled settings", async ({
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
  const service = timeOffPolicyService(orm, { today: "2026-11-06" });
  const history = termsService(orm, { today: "2026-11-06" });
  const draft3 = await service.saveTimeOffPolicy(OWNER, {
    termsId,
    timeOffTypeId: policy!.timeOffType.id,
    rules: {
      balance: "balance_from_allowance",
      entitlementDays: 22,
      bankHolidays: "bank_holidays_on_top_of_allowance",
    },
  });
  await service.publishTerms(OWNER, {
    termsId,
    versions: [draft3],
    startDate: "2027-01-01",
    owners: [{ termsId }],
  });
  const before = await history.readTermsHistory(OWNER, termsId, {});

  const [planned] = (
    await timeOffPolicyRepository(orm).findAssignments({ termsIds: [termsId] })
  ).filter(({ startDate }) => startDate === "2027-01-01");
  await service.cancelPolicyChange(OWNER, { assignmentId: planned!.id });

  const page = await history.readTermsHistory(OWNER, termsId, {});
  const added = page.edges.filter(
    ({ node }) => !before.edges.some((edge) => edge.node.id === node.id),
  );
  expect(added).toHaveLength(1);
  const line = added[0]!.node;
  expect(line).toMatchObject({
    recordType: "terms",
    recordId: termsId,
    operation: "UPDATED",
    cause: { kind: "EDITED_DIRECTLY" },
  });
  expect(line.changes).toHaveLength(1);
  expect(line.changes[0]).toMatchObject({
    field: `timeOff.${policy!.timeOffType.id}`,
    newLabel: "Annual leave",
    newValue: null,
  });
  expect(JSON.parse(line.changes[0]!.oldValue!)).toEqual({
    startDate: "2027-01-01",
    balance: "balance_from_allowance",
    entitlementDays: 22,
    bankHolidays: "bank_holidays_on_top_of_allowance",
  });
});

test("publishing to a person's own assignment writes their history", async ({
  orm,
  seed,
  transact,
}) => {
  const termsId = await seed.defaultTermsId();
  const employee = await seed.employee({ startDate: "2025-01-01" });
  await giveTermsPolicies(orm, transact, {
    termsId,
    policies: [{ key: "uk_20_days_plus_bank_holidays" }],
  });
  const [assignment] = await timeOffPolicyRepository(orm).findAssignments({ termsIds: [termsId] });
  await seedTimeOffAssignment(orm, {
    employeeId: employee.id,
    timeOffTypeId: assignment!.timeOffTypeId,
    timeOffPolicyId: assignment!.timeOffPolicyId,
    versionId: assignment!.versionId,
  });
  const service = timeOffPolicyService(orm);
  const draft = await service.saveTimeOffPolicy(OWNER, {
    termsId,
    timeOffTypeId: assignment!.timeOffTypeId,
    rules: {
      balance: "balance_from_allowance",
      entitlementDays: 22,
      bankHolidays: "bank_holidays_on_top_of_allowance",
    },
  });

  await service.publishTerms(OWNER, {
    termsId,
    versions: [draft],
    startDate: "2026-01-01",
    owners: [{ employeeId: employee.id }],
  });

  const history = await recordHistory.read(orm, "employee", employee.id, {});
  expect(history.edges).toHaveLength(1);
  expect(history.edges[0]!.node).toMatchObject({
    recordType: "employee",
    recordId: employee.id,
    operation: "UPDATED",
    changes: [{ field: `timeOff.${assignment!.timeOffTypeId}` }],
  });
  expect(JSON.parse(history.edges[0]!.node.changes[0]!.newValue!)).toMatchObject({
    startDate: "2026-01-01",
    entitlementDays: 22,
  });
});
