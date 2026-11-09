import {
  termsService,
  expect,
  OWNER,
  giveTermsPolicies,
  seedTimeOffType,
  test,
  timeOffPolicyService,
} from "#test/support";
import { timeOffPolicyRepository } from "../db";

test("stopping a type writes one terms history line with the old rules and stop date", async ({
  orm,
  seed,
  transact,
}) => {
  const termsId = await seed.defaultTermsId();
  await giveTermsPolicies(orm, transact, {
    termsId,
    policies: [{ recordOnly: "family_leave" }],
    today: "2026-11-06",
  });
  const [policy] = await timeOffPolicyRepository(orm).findAll();
  const service = timeOffPolicyService(orm, { today: "2026-11-06" });
  const history = termsService(orm, { today: "2026-11-06" });

  await service.stopPolicy(OWNER, {
    timeOffPolicyId: policy!.id,
    stopDate: "2027-01-01",
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
    newLabel: "Family leave",
    newValue: JSON.stringify({ stopDate: "2027-01-01" }),
  });
  expect(JSON.parse(line.changes[0]!.oldValue!)).toEqual({
    startDate: null,
    balance: "no_balance",
    entitlementDays: null,
    bankHolidays: null,
  });
});

test("cancelling a planned stop writes one terms history line with the cancelled stop date", async ({
  orm,
  seed,
  transact,
}) => {
  const termsId = await seed.defaultTermsId();
  await giveTermsPolicies(orm, transact, {
    termsId,
    policies: [{ recordOnly: "family_leave" }],
    today: "2026-11-06",
  });
  const [policy] = await timeOffPolicyRepository(orm).findAll();
  const service = timeOffPolicyService(orm, { today: "2026-11-06" });
  const history = termsService(orm, { today: "2026-11-06" });
  await service.stopPolicy(OWNER, {
    timeOffPolicyId: policy!.id,
    stopDate: "2027-01-01",
  });
  const before = await history.readTermsHistory(OWNER, termsId, {});

  await service.cancelPolicyChange(OWNER, {
    timeOffPolicyId: policy!.id,
    startDate: "2027-01-01",
  });

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
    newLabel: "Family leave",
    oldValue: JSON.stringify({ stopDate: "2027-01-01" }),
    newValue: null,
  });
});

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

  await service.changePolicy(OWNER, {
    timeOffPolicyId: policy!.id,
    startDate: "2026-01-01",
    rules: {
      balance: "balance_from_allowance",
      entitlementDays: 22,
      bankHolidays: "bank_holidays_on_top_of_allowance",
    },
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
    startDate: null,
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

  await service.createPolicy(OWNER, {
    termsId,
    timeOffTypeId: type.id,
    startDate: "2026-07-01",
    rules: { balance: "no_balance" },
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
  await service.changePolicy(OWNER, {
    timeOffPolicyId: policy!.id,
    startDate: "2027-01-01",
    rules: {
      balance: "balance_from_allowance",
      entitlementDays: 22,
      bankHolidays: "bank_holidays_on_top_of_allowance",
    },
  });
  const before = await history.readTermsHistory(OWNER, termsId, {});

  await service.cancelPolicyChange(OWNER, { timeOffPolicyId: policy!.id, startDate: "2027-01-01" });

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
