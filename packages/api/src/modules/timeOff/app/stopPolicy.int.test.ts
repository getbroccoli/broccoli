import {
  expect,
  OWNER,
  giveTermsPolicies,
  readAllowances,
  readTermsPolicies,
  seedTermsPeriods,
  seedTimeOff,
  seedTimeOffAssignment,
  seedTimeOffPolicy,
  termsService,
  test,
  timeOffPolicyService,
  timeOffService,
} from "#test/support";
import { timeOffPolicyRepository } from "../db";
import type { TimeOffRulesInput } from "../domain";
import type { TimeOffPolicyService } from "./timeOffPolicyService";

test("publishing a future stop ends today's rules and deletes later rows", async ({
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
  await publishRules(service, {
    termsId,
    timeOffTypeId: policy!.timeOffTypeId,
    startDate: "2027-02-01",
    rules: {
      balance: "balance_from_allowance",
      entitlementDays: 25,
      bankHolidays: "bank_holidays_on_top_of_allowance",
    },
  });

  const draft = await publishStop(service, termsId, policy!.timeOffTypeId, "2027-01-01");
  const [result] = await timeOffPolicyRepository(orm).findAssignments({ termsIds: [termsId] });

  expect(result).toMatchObject({
    owner: { termsId },
    timeOffTypeId: policy!.timeOffTypeId,
    versionId: policy!.versionId,
    startDate: "2026-01-01",
    endDate: "2026-12-31",
  });
  expect(await timeOffPolicyRepository(orm).findAssignments({ termsIds: [termsId] })).toEqual([
    result,
  ]);
  expect((await timeOffPolicyRepository(orm).findAll())[0]!.versions).not.toContainEqual(
    expect.objectContaining({ id: draft.id }),
  );
});

test("publishing a stop from today leaves the type not offered from today", async ({
  orm,
  seed,
  transact,
}) => {
  const termsId = await seed.defaultTermsId();
  await giveTermsPolicies(orm, transact, { termsId, policies: [{ recordOnly: "family_leave" }] });
  const [policy] = await readTermsPolicies(orm, termsId);
  const service = timeOffPolicyService(orm, { today: "2026-11-06" });

  await publishStop(service, termsId, policy!.timeOffTypeId, "2026-11-06");
  const [result] = await timeOffPolicyRepository(orm).findAssignments({ termsIds: [termsId] });

  expect(result).toMatchObject({ startDate: "2026-01-01", endDate: "2026-11-05" });
  const timeOff = await timeOffService(orm, { today: "2026-11-06" }).readTermsTimeOff(OWNER, [
    termsId,
  ]);
  expect(
    timeOff.get(termsId)!.find(({ timeOffType }) => timeOffType.id === policy!.timeOffTypeId)!
      .versions,
  ).toMatchObject([{ endDate: "2026-11-05" }]);
});

test.for(["approved", "pending_approval"] as const)(
  "%s time off on the stop date refuses publication and leaves everything unchanged",
  async (status, { orm, seed, transact }) => {
    const employee = await seed.employee({ startDate: "2025-01-01" });
    const termsId = await seed.defaultTermsId();
    await giveTermsPolicies(orm, transact, { termsId, policies: [{ recordOnly: "family_leave" }] });
    const [policy] = await readTermsPolicies(orm, termsId);
    await seedTimeOff(orm, {
      employeeId: employee.id,
      timeOffTypeId: policy!.timeOffTypeId,
      status,
      days: [{ date: "2027-01-01", dayPart: "full_day" }],
    });
    const service = timeOffPolicyService(orm, { today: "2026-11-06" });
    const draft = await service.saveTimeOffStop(OWNER, {
      termsId,
      timeOffTypeId: policy!.timeOffTypeId,
    });
    const repository = timeOffPolicyRepository(orm);
    const before = await repository.findAssignments({ termsIds: [termsId] });
    const policies = await repository.findAll();
    const allowances = await readAllowances(orm, employee.id);
    const history = await termsService(orm).readTermsHistory(OWNER, termsId, {});

    const stopping = service.publishTerms(OWNER, {
      termsId,
      versions: [draft],
      startDate: "2027-01-01",
      owners: [{ termsId }],
    });

    await expect(stopping).rejects.toMatchObject({
      code: "CONFLICT",
      message: "1 person has this time off type booked from that date.",
    });
    expect(await timeOffPolicyRepository(orm).findAssignments({ termsIds: [termsId] })).toEqual(
      before,
    );
    expect(await repository.findAll()).toEqual(policies);
    expect(await readAllowances(orm, employee.id)).toEqual(allowances);
    expect(await termsService(orm).readTermsHistory(OWNER, termsId, {})).toEqual(history);
  },
);

test("declined time off after the stop date does not prevent stopping the type", async ({
  orm,
  seed,
  transact,
}) => {
  const employee = await seed.employee({ startDate: "2025-01-01" });
  const termsId = await seed.defaultTermsId();
  await giveTermsPolicies(orm, transact, { termsId, policies: [{ recordOnly: "family_leave" }] });
  const [policy] = await readTermsPolicies(orm, termsId);
  await seedTimeOff(orm, {
    employeeId: employee.id,
    timeOffTypeId: policy!.timeOffTypeId,
    status: "declined",
    days: [{ date: "2027-01-04", dayPart: "full_day" }],
  });
  const service = timeOffPolicyService(orm, { today: "2026-11-06" });

  await publishStop(service, termsId, policy!.timeOffTypeId, "2027-01-01");
  const [result] = await timeOffPolicyRepository(orm).findAssignments({ termsIds: [termsId] });

  expect(result).toMatchObject({ startDate: "2026-01-01", endDate: "2026-12-31" });
});

test("a person with their own rules keeps them and their booked time off does not block the stop", async ({
  orm,
  seed,
  transact,
}) => {
  const employee = await seed.employee({ startDate: "2025-01-01" });
  const termsId = await seed.defaultTermsId();
  await giveTermsPolicies(orm, transact, { termsId, policies: [{ recordOnly: "family_leave" }] });
  const [policy] = await readTermsPolicies(orm, termsId);
  const personal = await seedTimeOffPolicy(orm, {
    name: "Personal family leave",
    timeOffTypeId: policy!.timeOffTypeId,
    balance: "unlimited_balance",
  });
  await seedTimeOffAssignment(orm, {
    employeeId: employee.id,
    timeOffTypeId: policy!.timeOffTypeId,
    timeOffPolicyId: personal.id,
    versionId: personal.versionId,
  });
  await seedTimeOff(orm, {
    employeeId: employee.id,
    timeOffTypeId: policy!.timeOffTypeId,
    status: "approved",
    days: [{ date: "2027-01-04", dayPart: "full_day" }],
  });
  const before = await timeOffPolicyRepository(orm).findAssignments({ employeeIds: [employee.id] });
  const service = timeOffPolicyService(orm, { today: "2026-11-06" });

  await publishStop(service, termsId, policy!.timeOffTypeId, "2027-01-01");
  const [result] = await timeOffPolicyRepository(orm).findAssignments({ termsIds: [termsId] });

  expect(result).toMatchObject({ startDate: "2026-01-01", endDate: "2026-12-31" });
  expect(
    await timeOffPolicyRepository(orm).findAssignments({ employeeIds: [employee.id] }),
  ).toEqual(before);
});

test("stopping in December takes December's share of a reached person's yearly entitlement", async ({
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

  await publishStop(service, termsId, policy!.timeOffTypeId, "2026-12-01");

  const [allowance] = await readAllowances(orm, employee.id);
  // December's 31 of 365 days at 20 days a year go.
  expect(allowance!.lines).toContainEqual({
    kind: "entitlement_grant",
    rule: "yearly_entitlement",
    amount: -1.69863,
    effectiveDate: "2026-12-01",
    causeKind: "time_off_rules_changed",
    causeRef: `${policy!.id}:2026-12-01`,
  });
});

test("offering a stopped type again from its stop date offers it open-ended", async ({
  orm,
  seed,
  transact,
}) => {
  const termsId = await seed.defaultTermsId();
  await giveTermsPolicies(orm, transact, { termsId, policies: [{ recordOnly: "family_leave" }] });
  const [policy] = await readTermsPolicies(orm, termsId);
  const service = timeOffPolicyService(orm, { today: "2026-11-06" });
  await publishStop(service, termsId, policy!.timeOffTypeId, "2026-11-06");
  const [stopped] = await timeOffPolicyRepository(orm).findAssignments({ termsIds: [termsId] });

  const offer = await publishRules(service, {
    termsId,
    timeOffTypeId: policy!.timeOffTypeId,
    startDate: "2026-11-06",
    rules: { balance: "no_balance" },
  });

  expect(await timeOffPolicyRepository(orm).findAssignments({ termsIds: [termsId] })).toMatchObject(
    [
      { id: stopped!.id, endDate: "2026-11-05" },
      { versionId: offer.id, startDate: "2026-11-06", endDate: null },
    ],
  );
});

test("time off booked while a person is on other terms does not block publishing a stop", async ({
  orm,
  seed,
  transact,
}) => {
  const employee = await seed.employee({ startDate: "2025-01-01" });
  const termsId = await seed.defaultTermsId();
  const otherTermsId = await seed.terms("Other terms");
  await giveTermsPolicies(orm, transact, { termsId, policies: [{ recordOnly: "family_leave" }] });
  await giveTermsPolicies(orm, transact, {
    termsId: otherTermsId,
    policies: [{ recordOnly: "family_leave" }],
  });
  const [policy] = await readTermsPolicies(orm, termsId);
  await seedTermsPeriods(orm, employee.id, [
    { termsId, startDate: "2025-01-01", endDate: "2026-12-31" },
    { termsId: otherTermsId, startDate: "2027-01-01", endDate: null },
  ]);
  await seedTimeOff(orm, {
    employeeId: employee.id,
    timeOffTypeId: policy!.timeOffTypeId,
    status: "approved",
    days: [{ date: "2027-01-04", dayPart: "full_day" }],
  });
  const repository = timeOffPolicyRepository(orm);
  const otherAssignments = await repository.findAssignments({ termsIds: [otherTermsId] });
  const service = timeOffPolicyService(orm, { today: "2026-11-06" });

  await publishStop(service, termsId, policy!.timeOffTypeId, "2027-01-01");

  expect(await repository.findAssignments({ termsIds: [termsId] })).toMatchObject([
    { endDate: "2026-12-31" },
  ]);
  expect(await repository.findAssignments({ termsIds: [otherTermsId] })).toEqual(otherAssignments);
});

async function publishRules(
  service: TimeOffPolicyService,
  input: { termsId: string; timeOffTypeId: string; startDate: string; rules: TimeOffRulesInput },
) {
  const { termsId, timeOffTypeId, startDate, rules } = input;
  const draft = await service.saveTimeOffPolicy(OWNER, { termsId, timeOffTypeId, rules });
  await service.publishTerms(OWNER, {
    termsId,
    versions: [draft],
    startDate,
    owners: [{ termsId }],
  });
  return draft;
}

async function publishStop(
  service: TimeOffPolicyService,
  termsId: string,
  timeOffTypeId: string,
  startDate: string,
) {
  const draft = await service.saveTimeOffStop(OWNER, { termsId, timeOffTypeId });
  await service.publishTerms(OWNER, {
    termsId,
    versions: [draft],
    startDate,
    owners: [{ termsId }],
  });
  return draft;
}
