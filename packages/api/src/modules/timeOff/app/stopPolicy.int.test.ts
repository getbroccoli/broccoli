import {
  expect,
  OWNER,
  giveTermsPolicies,
  readAllowances,
  readTermsPolicies,
  seedTimeOff,
  seedTimeOffAssignment,
  seedTimeOffPolicy,
  seedTimeOffType,
  test,
  timeOffPolicyService,
  timeOffService,
} from "#test/support";
import { timeOffPolicyRepository } from "../db";
import type { TimeOffRulesInput } from "../domain";
import type { TimeOffPolicyService } from "./timeOffPolicyService";

test("a stop ends rules and deletes later rows", async ({ orm, seed, transact }) => {
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

  const result = await service.stopPolicy(OWNER, {
    termsId,
    timeOffTypeId: policy!.timeOffTypeId,
    stopDate: "2027-01-01",
  });

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
});

test("stopping from today ends the assignment yesterday and leaves the type not offered", async ({
  orm,
  seed,
  transact,
}) => {
  const termsId = await seed.defaultTermsId();
  await giveTermsPolicies(orm, transact, { termsId, policies: [{ recordOnly: "family_leave" }] });
  const [policy] = await readTermsPolicies(orm, termsId);
  const service = timeOffPolicyService(orm, { today: "2026-11-06" });

  const result = await service.stopPolicy(OWNER, {
    termsId,
    timeOffTypeId: policy!.timeOffTypeId,
    stopDate: "2026-11-06",
  });

  expect(result).toMatchObject({ startDate: "2026-01-01", endDate: "2026-11-05" });
  const timeOff = await timeOffService(orm, { today: "2026-11-06" }).readTermsTimeOff(OWNER, [
    termsId,
  ]);
  expect(
    timeOff.get(termsId)!.find(({ timeOffType }) => timeOffType.id === result.timeOffTypeId)!
      .versions,
  ).toMatchObject([{ endDate: "2026-11-05" }]);
});

test.for(["approved", "pending_approval"] as const)(
  "%s time off on the stop date prevents stopping the type for a person on the terms",
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
    const before = await timeOffPolicyRepository(orm).findAssignments({ termsIds: [termsId] });

    const stopping = service.stopPolicy(OWNER, {
      termsId,
      timeOffTypeId: policy!.timeOffTypeId,
      stopDate: "2027-01-01",
    });

    await expect(stopping).rejects.toMatchObject({
      code: "CONFLICT",
      message: "1 person has this time off type booked from that date.",
    });
    expect(await timeOffPolicyRepository(orm).findAssignments({ termsIds: [termsId] })).toEqual(
      before,
    );
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

  const result = await service.stopPolicy(OWNER, {
    termsId,
    timeOffTypeId: policy!.timeOffTypeId,
    stopDate: "2027-01-01",
  });

  expect(result).toMatchObject({ startDate: "2026-01-01", endDate: "2026-12-31" });
});

test.for(["2026-12-31", "2027-01-01"])(
  "stopping on %s is refused when the offer starts on 2027-01-01",
  async (stopDate, { orm, seed }) => {
    const termsId = await seed.defaultTermsId();
    const type = await seedTimeOffType(orm, "Study leave");
    const service = timeOffPolicyService(orm, { today: "2026-11-06" });
    await publishRules(service, {
      termsId,
      timeOffTypeId: type.id,
      startDate: "2027-01-01",
      rules: { balance: "no_balance" },
    });

    const before = await timeOffPolicyRepository(orm).findAssignments({ termsIds: [termsId] });

    const stopping = service.stopPolicy(OWNER, { termsId, timeOffTypeId: type.id, stopDate });

    await expect(stopping).rejects.toMatchObject({
      code: "INVALID_INPUT",
      fieldErrors: [{ field: "stopDate", code: "not_offered" }],
    });
    expect(await timeOffPolicyRepository(orm).findAssignments({ termsIds: [termsId] })).toEqual(
      before,
    );
  },
);

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

  const result = await service.stopPolicy(OWNER, {
    termsId,
    timeOffTypeId: policy!.timeOffTypeId,
    stopDate: "2027-01-01",
  });

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

  await service.stopPolicy(OWNER, {
    termsId,
    timeOffTypeId: policy!.timeOffTypeId,
    stopDate: "2026-12-01",
  });

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
  const service = timeOffPolicyService(orm, { today: "2026-11-09" });
  const stopped = await service.stopPolicy(OWNER, {
    termsId,
    timeOffTypeId: policy!.timeOffTypeId,
    stopDate: "2026-11-09",
  });

  const offer = await publishRules(service, {
    termsId,
    timeOffTypeId: policy!.timeOffTypeId,
    startDate: "2026-11-09",
    rules: { balance: "no_balance" },
  });

  expect(await timeOffPolicyRepository(orm).findAssignments({ termsIds: [termsId] })).toMatchObject(
    [
      { id: stopped.id, endDate: "2026-11-08" },
      { versionId: offer.id, startDate: "2026-11-09", endDate: null },
    ],
  );
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
