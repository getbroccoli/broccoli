import {
  calendarDate,
  expect,
  OWNER,
  giveTermsPolicies,
  readAllowances,
  readTermsPolicies,
  seedTimeOffAssignment,
  seedTimeOffType,
  termsService,
  test,
  timeOffPolicyService,
} from "#test/support";
import { timeOffPolicyRepository } from "../db";

test("saving a stop is refused when the terms do not offer the type today", async ({
  orm,
  seed,
}) => {
  const termsId = await seed.defaultTermsId();
  const type = await seedTimeOffType(orm, "Study leave");
  const service = timeOffPolicyService(orm, { today: "2026-11-06" });
  const offer = await service.saveTimeOffPolicy(OWNER, {
    termsId,
    timeOffTypeId: type.id,
    rules: { balance: "no_balance" },
  });
  await service.publishTerms(OWNER, {
    termsId,
    versions: [offer],
    startDate: "2027-01-01",
    owners: [{ termsId }],
  });
  const before = await timeOffPolicyRepository(orm).findAll();

  await expect(
    service.saveTimeOffStop(OWNER, { termsId, timeOffTypeId: type.id }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "timeOffTypeId", code: "not_offered" }],
  });

  expect(await timeOffPolicyRepository(orm).findAll()).toEqual(before);
});

test("saving a stop replaces the rules draft with today's rules and saving rules turns it back", async ({
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
  const [policy] = await readTermsPolicies(orm, termsId);
  const service = timeOffPolicyService(orm, { today: "2026-11-06" });
  const rules = await service.saveTimeOffPolicy(OWNER, {
    termsId,
    timeOffTypeId: policy!.timeOffTypeId,
    rules: {
      balance: "balance_from_allowance",
      entitlementDays: 25,
      bankHolidays: "bank_holidays_on_top_of_allowance",
    },
  });

  const stop = await service.saveTimeOffStop(OWNER, {
    termsId,
    timeOffTypeId: policy!.timeOffTypeId,
  });

  expect(stop).toMatchObject({
    id: rules.id,
    timeOffPolicyId: rules.timeOffPolicyId,
    termsId,
    status: "draft",
    revision: 2,
    stops: true,
    balance: "balance_from_allowance",
    bankHolidays: "bank_holidays_on_top_of_allowance",
    leaveYear: { kind: "leave_year_from_fixed_date", month: 1, day: 1 },
    rules: [{ kind: "yearly_entitlement", entitlementDays: 20 }],
  });
  const restored = await service.saveTimeOffPolicy(OWNER, {
    termsId,
    timeOffTypeId: policy!.timeOffTypeId,
    rules: { balance: "no_balance" },
  });

  expect(restored).toMatchObject({
    id: rules.id,
    revision: 3,
    stops: false,
    balance: "no_balance",
  });
  expect(
    (await timeOffPolicyRepository(orm).findAll())[0]!.versions.filter(
      ({ status }) => status === "draft",
    ),
  ).toEqual([restored]);
});

test("saving and discarding a stop leaves the rules, allowances and history unchanged", async ({
  orm,
  seed,
  transact,
}) => {
  const employee = await seed.employee({ startDate: "2025-01-01" });
  const termsId = await seed.defaultTermsId();
  await giveTermsPolicies(orm, transact, {
    termsId,
    policies: [{ key: "uk_20_days_plus_bank_holidays" }],
    today: "2026-11-06",
  });
  const [policy] = await readTermsPolicies(orm, termsId);
  const service = timeOffPolicyService(orm, { today: "2026-11-06" });
  const repository = timeOffPolicyRepository(orm);
  const policies = await repository.findAll();
  const assignments = await repository.findAssignments({ termsIds: [termsId] });
  const allowances = await readAllowances(orm, employee.id);
  const history = await termsService(orm).readTermsHistory(OWNER, termsId, {});

  const draft = await service.saveTimeOffStop(OWNER, {
    termsId,
    timeOffTypeId: policy!.timeOffTypeId,
  });

  expect(draft).toMatchObject({ status: "draft", revision: 1, stops: true });
  expect(await repository.findAssignments({ termsIds: [termsId] })).toEqual(assignments);
  expect(await readAllowances(orm, employee.id)).toEqual(allowances);
  expect(await termsService(orm).readTermsHistory(OWNER, termsId, {})).toEqual(history);

  await service.discardTimeOffPolicy(OWNER, { versionId: draft.id });

  expect(await repository.findAll()).toEqual(policies);
  expect(await repository.findAssignments({ termsIds: [termsId] })).toEqual(assignments);
  expect(await readAllowances(orm, employee.id)).toEqual(allowances);
  expect(await termsService(orm).readTermsHistory(OWNER, termsId, {})).toEqual(history);
});

test("publish suggestions list the stop draft, these terms first and people reached from the chosen date", async ({
  orm,
  seed,
  transact,
}) => {
  const termsId = await seed.defaultTermsId();
  const otherTermsId = await seed.terms("Other terms");
  const employee = await seed.employee({ firstName: "Amy", startDate: "2025-01-01" });
  const later = await seed.employee({ firstName: "Zoe", startDate: "2027-02-01" });
  await seed.moveToTerms(later.id, termsId, "2027-02-01");
  const other = await seed.employee({ startDate: "2025-01-01" });
  await seed.moveToTerms(other.id, otherTermsId);
  await giveTermsPolicies(orm, transact, { termsId, policies: [{ recordOnly: "family_leave" }] });
  const [policy] = await readTermsPolicies(orm, termsId);
  await timeOffPolicyRepository(orm).insertAssignment({
    owner: { termsId: otherTermsId },
    timeOffTypeId: policy!.timeOffTypeId,
    timeOffPolicyId: policy!.id,
    versionId: policy!.versionId,
    startDate: calendarDate("2027-02-01"),
    endDate: null,
  });
  const service = timeOffPolicyService(orm, { today: "2026-11-06" });
  const draft = await service.saveTimeOffStop(OWNER, {
    termsId,
    timeOffTypeId: policy!.timeOffTypeId,
  });

  const suggestions = await service.readPublishSuggestions(OWNER, { termsId, from: "2027-01-01" });

  expect(suggestions.versions).toEqual([
    { id: draft.id, revision: 1, timeOffTypeId: policy!.timeOffTypeId },
  ]);
  expect(suggestions.owners).toMatchObject([
    {
      owner: { termsId },
      versionIds: [draft.id],
      reached: [{ id: employee.id }, { id: later.id }],
    },
    { owner: { termsId: otherTermsId }, versionIds: [draft.id], reached: [{ id: other.id }] },
  ]);
});

test("stop suggestions exclude people whose own assignment of the same version covers them from the chosen date", async ({
  orm,
  seed,
  transact,
}) => {
  const termsId = await seed.defaultTermsId();
  const employee = await seed.employee({ startDate: "2025-01-01" });
  const personal = await seed.employee({ startDate: "2025-01-01" });
  await giveTermsPolicies(orm, transact, { termsId, policies: [{ recordOnly: "family_leave" }] });
  const [policy] = await readTermsPolicies(orm, termsId);
  await seedTimeOffAssignment(orm, {
    employeeId: personal.id,
    timeOffTypeId: policy!.timeOffTypeId,
    timeOffPolicyId: policy!.id,
    versionId: policy!.versionId,
    startDate: "2026-11-06",
  });
  const service = timeOffPolicyService(orm, { today: "2026-11-06" });
  await service.saveTimeOffStop(OWNER, {
    termsId,
    timeOffTypeId: policy!.timeOffTypeId,
  });

  const suggestions = await service.readPublishSuggestions(OWNER, { termsId, from: "2026-11-06" });

  expect(suggestions.owners[0]).toMatchObject({
    owner: { termsId },
    reached: [{ id: employee.id }],
  });
});

test("publishing a stop is refused when the selected owner no longer offers the policy from that date", async ({
  orm,
  seed,
  transact,
}) => {
  const termsId = await seed.defaultTermsId();
  await giveTermsPolicies(orm, transact, { termsId, policies: [{ recordOnly: "family_leave" }] });
  const [policy] = await readTermsPolicies(orm, termsId);
  const service = timeOffPolicyService(orm, { today: "2026-11-06" });
  const first = await service.saveTimeOffStop(OWNER, {
    termsId,
    timeOffTypeId: policy!.timeOffTypeId,
  });
  await service.publishTerms(OWNER, {
    termsId,
    versions: [first],
    startDate: "2027-01-01",
    owners: [{ termsId }],
  });
  const draft = await service.saveTimeOffStop(OWNER, {
    termsId,
    timeOffTypeId: policy!.timeOffTypeId,
  });
  const repository = timeOffPolicyRepository(orm);
  const assignments = await repository.findAssignments({ termsIds: [termsId] });
  const policies = await repository.findAll();
  const history = await termsService(orm).readTermsHistory(OWNER, termsId, {});

  await expect(
    service.publishTerms(OWNER, {
      termsId,
      versions: [draft],
      startDate: "2027-01-01",
      owners: [{ termsId }],
    }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "startDate", code: "not_offered" }],
  });

  expect(await repository.findAssignments({ termsIds: [termsId] })).toEqual(assignments);
  expect(await repository.findAll()).toEqual(policies);
  expect(await termsService(orm).readTermsHistory(OWNER, termsId, {})).toEqual(history);
});
