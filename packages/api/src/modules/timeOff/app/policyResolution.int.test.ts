import {
  expect,
  giveTermsPolicies,
  OWNER,
  readTermsPolicies,
  seedTimeOffAssignment,
  seedTimeOffPolicy,
  test,
  timeOffService,
} from "#test/support";

test("a direct policy overrides only its type and falls back to the terms when it ends", async ({
  orm,
  seed,
  transact,
}) => {
  const employee = await seed.employee({ startDate: "2025-01-01" });
  const termsId = await seed.defaultTermsId();
  await giveTermsPolicies(orm, transact, {
    termsId,
    policies: [{ key: "uk_20_days_plus_bank_holidays" }, { recordOnly: "sickness" }],
  });
  const policies = await readTermsPolicies(orm, termsId);
  const sickness = policies.find(({ typeKey }) => typeKey === "sickness")!;
  const annual = policies.find(({ typeKey }) => typeKey === "annual_leave")!;
  const own = await seedTimeOffPolicy(orm, {
    name: "Own sickness",
    timeOffTypeId: sickness.timeOffTypeId,
    balance: "unlimited_balance",
  });
  await seedTimeOffAssignment(orm, {
    employeeId: employee.id,
    timeOffTypeId: sickness.timeOffTypeId,
    timeOffPolicyId: own.id,
    versionId: own.versionId,
    startDate: "2026-06-01",
    endDate: "2026-06-15",
  });

  const result = (
    await timeOffService(orm).readPersonTimeOff(OWNER, { employeeIds: [employee.id] })
  ).get(employee.id)!;

  expect(
    result.find(({ timeOffType }) => timeOffType.id === sickness.timeOffTypeId)!.versions,
  ).toMatchObject([
    {
      source: "their_own",
      startDate: "2026-06-01",
      endDate: "2026-06-15",
      version: { id: own.versionId, balance: "unlimited_balance" },
    },
    {
      source: "from_their_terms",
      startDate: "2026-06-16",
      endDate: null,
      version: { id: sickness.versionId, balance: "no_balance" },
    },
  ]);
  expect(
    result.find(({ timeOffType }) => timeOffType.id === annual.timeOffTypeId)!.versions,
  ).toMatchObject([
    {
      source: "from_their_terms",
      startDate: "2026-06-01",
      endDate: null,
      version: { id: annual.versionId, rules: [{ entitlementDays: 20 }] },
    },
  ]);
});
