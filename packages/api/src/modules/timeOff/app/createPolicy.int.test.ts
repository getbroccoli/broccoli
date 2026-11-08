import {
  expect,
  OWNER,
  readAllowances,
  seedTimeOffType,
  test,
  timeOffPolicyService,
} from "#test/support";
import { timeOffPolicyRepository } from "../db";

test("offering a type creates its dated policy and grants the reached person's allowance", async ({
  orm,
  seed,
}) => {
  const termsId = await seed.defaultTermsId();
  const employee = await seed.employee({ startDate: "2025-01-01" });
  const type = await seedTimeOffType(orm, "Study leave");
  const service = timeOffPolicyService(orm, { today: "2026-11-06" });

  const policy = await service.createPolicy(OWNER, {
    termsId,
    timeOffTypeId: type.id,
    startDate: "2026-01-01",
    rules: {
      balance: "balance_from_allowance",
      entitlementDays: 5,
      bankHolidays: "bank_holidays_on_top_of_allowance",
    },
  });

  expect(policy).toMatchObject({
    termsId,
    timeOffType: { id: type.id },
    versions: [
      {
        startDate: "2026-01-01",
        endDate: null,
        balance: "balance_from_allowance",
        rules: [{ kind: "yearly_entitlement", entitlementDays: 5 }],
      },
    ],
  });
  expect(await timeOffPolicyRepository(orm).findAll()).toEqual([policy]);
  const allowances = await readAllowances(orm, employee.id);
  expect(allowances).toMatchObject([{ leaveYearStart: "2026-01-01", total: 5 }]);
  expect(allowances[0]!.lines).toContainEqual(
    expect.objectContaining({
      causeKind: "time_off_rules_changed",
      causeRef: `${policy.id}:2026-01-01`,
    }),
  );
});

test("an offer may choose how leave counts away from the leave year start", async ({
  orm,
  seed,
}) => {
  const termsId = await seed.defaultTermsId();
  const type = await seedTimeOffType(orm, "Study leave");
  const service = timeOffPolicyService(orm, { today: "2026-11-06" });

  const policy = await service.createPolicy(OWNER, {
    termsId,
    timeOffTypeId: type.id,
    startDate: "2026-07-01",
    rules: { balance: "unlimited_balance" },
  });

  expect(policy.versions).toMatchObject([
    {
      startDate: "2026-07-01",
      endDate: null,
      balance: "unlimited_balance",
      bankHolidays: null,
      rules: [],
    },
  ]);
});

test("a second offer for the same terms and type is refused", async ({ orm, seed }) => {
  const termsId = await seed.defaultTermsId();
  const type = await seedTimeOffType(orm, "Study leave");
  const service = timeOffPolicyService(orm, { today: "2026-11-06" });
  const policy = await service.createPolicy(OWNER, {
    termsId,
    timeOffTypeId: type.id,
    startDate: "2027-01-01",
    rules: { balance: "no_balance" },
  });

  await expect(
    service.createPolicy(OWNER, {
      termsId,
      timeOffTypeId: type.id,
      startDate: "2026-12-01",
      rules: { balance: "no_balance" },
    }),
  ).rejects.toMatchObject({ code: "CONFLICT" });

  expect(await timeOffPolicyRepository(orm).findAll()).toEqual([policy]);
});

test("an offer cannot start before the start of this year", async ({ orm, seed }) => {
  const termsId = await seed.defaultTermsId();
  const type = await seedTimeOffType(orm, "Study leave");
  const service = timeOffPolicyService(orm, { today: "2026-11-06" });

  await expect(
    service.createPolicy(OWNER, {
      termsId,
      timeOffTypeId: type.id,
      startDate: "2025-12-31",
      rules: { balance: "no_balance" },
    }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "startDate", code: "too_early" }],
  });

  expect(await timeOffPolicyRepository(orm).findAll()).toEqual([]);
});
