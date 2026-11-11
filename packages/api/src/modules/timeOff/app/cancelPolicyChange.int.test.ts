import {
  calendarDate,
  seedTermsPolicy,
  seedTimeOffType,
  EMPLOYEE,
  expect,
  OWNER,
  giveTermsPolicies,
  readAllowances,
  readTermsPolicies,
  test,
  timeOffPolicyService,
  timeOffService,
} from "#test/support";
import type { Orm } from "../../../core/db";
import { timeOffPolicyRepository } from "../db";
import { type TimeOffRulesInput, RECORD_ONLY_POLICY, STANDARD_LEAVE_POLICIES } from "../domain";

test("cancelling a planned change restores the previous assignment's end date", async ({
  orm,
  seed,
  transact,
}) => {
  const termsId = await seed.defaultTermsId();
  await giveTermsPolicies(orm, transact, {
    termsId,
    policies: [{ key: "uk_20_days_plus_bank_holidays" }],
  });
  const [policy] = await readTermsPolicies(orm, termsId);
  const cancelledId = await publishRules(orm, termsId, policy!.timeOffTypeId, "2026-12-01", 22);
  const keptId = await publishRules(orm, termsId, policy!.timeOffTypeId, "2027-01-01", 25);

  await timeOffPolicyService(orm).cancelPolicyChange(OWNER, { assignmentId: cancelledId });

  expect(await timeOffPolicyRepository(orm).findAssignments({ termsIds: [termsId] })).toMatchObject(
    [
      { versionId: policy!.versionId, startDate: "2026-01-01", endDate: "2026-12-31" },
      { id: keptId, startDate: "2027-01-01", endDate: null },
    ],
  );
});

test("cancelling January's change refuses a restored July boundary that changes how leave counts mid-year", async ({
  orm,
  seed,
  transact,
}) => {
  const termsId = await seed.defaultTermsId();
  await giveTermsPolicies(orm, transact, { termsId, policies: [{ recordOnly: "family_leave" }] });
  const [policy] = await readTermsPolicies(orm, termsId);
  const assignmentId = await publishRules(orm, termsId, policy!.timeOffTypeId, "2027-01-01", 10);
  await publishRules(orm, termsId, policy!.timeOffTypeId, "2027-07-01", 12);
  const before = await timeOffPolicyRepository(orm).findAssignments({ termsIds: [termsId] });

  await expect(
    timeOffPolicyService(orm).cancelPolicyChange(OWNER, { assignmentId }),
  ).rejects.toMatchObject({
    code: "CONFLICT",
    message:
      "Cancelling this change would change how the type counts partway through a leave year.",
  });
  expect(await timeOffPolicyRepository(orm).findAssignments({ termsIds: [termsId] })).toEqual(
    before,
  );
});

test("cancelling a planned offer leaves the type not offered and retains its published settings", async ({
  orm,
  seed,
}) => {
  const termsId = await seed.defaultTermsId();
  const [type] = await timeOffPolicyRepository(orm).findAllTypes();
  const assignmentId = await publishRules(orm, termsId, type!.id, "2027-01-01", {
    balance: "no_balance",
  });
  const before = await timeOffPolicyRepository(orm).findAll();

  await timeOffPolicyService(orm).cancelPolicyChange(OWNER, { assignmentId });

  const timeOff = await timeOffService(orm).readTermsTimeOff(OWNER, [termsId]);
  expect(
    timeOff.get(termsId)!.find(({ timeOffType }) => timeOffType.id === type!.id)!.versions,
  ).toEqual([]);
  expect(await timeOffPolicyRepository(orm).findAll()).toEqual(before);
});

test("cancelling December's rules restores the allowance already granted from them", async ({
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
  const assignmentId = await publishRules(orm, termsId, policy!.timeOffTypeId, "2026-12-01", 32);
  expect(await readAllowances(orm, employee.id)).toMatchObject([{ total: 21.5 }]);

  await timeOffPolicyService(orm).cancelPolicyChange(OWNER, { assignmentId });

  const allowances = await readAllowances(orm, employee.id);
  expect(allowances).toMatchObject([{ total: 20 }]);
  expect(allowances[0]!.lines.at(-1)).toMatchObject({
    causeKind: "time_off_rules_changed",
    causeRef: `${policy!.id}:2026-12-01`,
  });
});

test.for(["2026-05-31", "2026-06-01"])(
  "a policy change that started on %s cannot be cancelled",
  async (startDate, { orm, seed, transact }) => {
    const termsId = await seed.defaultTermsId();
    await giveTermsPolicies(orm, transact, {
      termsId,
      policies: [{ key: "uk_20_days_plus_bank_holidays" }],
    });
    const [policy] = await readTermsPolicies(orm, termsId);
    const assignmentId = await publishRules(orm, termsId, policy!.timeOffTypeId, startDate, 22);
    const before = await timeOffPolicyRepository(orm).findAssignments({ termsIds: [termsId] });

    await expect(
      timeOffPolicyService(orm).cancelPolicyChange(OWNER, { assignmentId }),
    ).rejects.toMatchObject({ code: "CONFLICT", message: "This change has already started." });
    expect(await timeOffPolicyRepository(orm).findAssignments({ termsIds: [termsId] })).toEqual(
      before,
    );
  },
);

test("an unknown policy assignment cannot be cancelled", async ({ orm }) => {
  await expect(
    timeOffPolicyService(orm).cancelPolicyChange(OWNER, {
      assignmentId: "00000000-0000-4000-8000-000000000001",
    }),
  ).rejects.toMatchObject({ code: "NOT_FOUND", message: "No time off rules change has this id." });
});

test("an employee cannot cancel planned rules", async ({ orm, seed }) => {
  const termsId = await seed.defaultTermsId();
  const [type] = await timeOffPolicyRepository(orm).findAllTypes();
  const assignmentId = await publishRules(orm, termsId, type!.id, "2027-01-01", {
    balance: "no_balance",
  });
  const before = await timeOffPolicyRepository(orm).findAssignments({ termsIds: [termsId] });

  await expect(
    timeOffPolicyService(orm).cancelPolicyChange(EMPLOYEE, { assignmentId }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(await timeOffPolicyRepository(orm).findAssignments({ termsIds: [termsId] })).toEqual(
    before,
  );
});

test("cancelling a change does not compare counts across the gap before the next row", async ({
  orm,
  seed,
}) => {
  const termsId = await seed.defaultTermsId();
  const type = await seedTimeOffType(orm, "Study leave");
  const previous = await seedTermsPolicy(orm, {
    termsId,
    timeOffTypeId: type.id,
    version: RECORD_ONLY_POLICY,
    startDate: "2026-01-01",
    endDate: "2026-12-31",
  });
  const repository = timeOffPolicyRepository(orm);
  const versionId = await repository.insertVersion(previous.id, {
    ...STANDARD_LEAVE_POLICIES.uk_20_days_plus_bank_holidays,
    status: "published",
  });
  const assignmentId = await repository.insertAssignment({
    owner: { termsId },
    timeOffTypeId: type.id,
    timeOffPolicyId: previous.id,
    versionId,
    startDate: calendarDate("2027-01-01"),
    endDate: calendarDate("2027-06-30"),
  });
  const nextId = await repository.insertAssignment({
    owner: { termsId },
    timeOffTypeId: type.id,
    timeOffPolicyId: previous.id,
    versionId,
    startDate: calendarDate("2027-08-01"),
    endDate: null,
  });

  await timeOffPolicyService(orm).cancelPolicyChange(OWNER, { assignmentId });

  expect(await repository.findAssignments({ termsIds: [termsId] })).toMatchObject([
    {
      id: previous.assignmentId,
      versionId: previous.versionId,
      startDate: "2026-01-01",
      endDate: "2027-06-30",
    },
    { id: nextId, versionId, startDate: "2027-08-01", endDate: null },
  ]);
});

async function publishRules(
  orm: Orm,
  termsId: string,
  timeOffTypeId: string,
  startDate: string,
  rules: number | TimeOffRulesInput,
) {
  const service = timeOffPolicyService(orm);
  const draft = await service.saveTimeOffPolicy(OWNER, {
    termsId,
    timeOffTypeId,
    rules:
      typeof rules === "number"
        ? {
            balance: "balance_from_allowance",
            entitlementDays: rules,
            bankHolidays: "bank_holidays_on_top_of_allowance",
          }
        : rules,
  });
  await service.publishTerms(OWNER, {
    termsId,
    versions: [draft],
    startDate,
    owners: [{ termsId }],
  });
  return (await timeOffPolicyRepository(orm).findAssignments({ termsIds: [termsId] })).find(
    (row) => row.timeOffTypeId === timeOffTypeId && row.startDate === startDate,
  )!.id;
}
