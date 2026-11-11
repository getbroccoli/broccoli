import {
  EMPLOYEE,
  expect,
  OWNER,
  seedTimeOffType,
  test,
  timeOffPolicyService,
} from "#test/support";
import { timeOffPolicyRepository } from "../db";

test("an allowance requires a bank holiday choice", async ({ orm, seed }) => {
  const termsId = await seed.defaultTermsId();
  const type = await seedTimeOffType(orm, "Study leave");

  await expect(
    timeOffPolicyService(orm).saveTimeOffPolicy(OWNER, {
      termsId,
      timeOffTypeId: type.id,
      rules: { balance: "balance_from_allowance", entitlementDays: 22 },
    }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "rules.bankHolidays", code: "required" }],
  });
});

test("an allowance requires yearly entitlement days", async ({ orm, seed }) => {
  const termsId = await seed.defaultTermsId();
  const type = await seedTimeOffType(orm, "Study leave");

  await expect(
    timeOffPolicyService(orm).saveTimeOffPolicy(OWNER, {
      termsId,
      timeOffTypeId: type.id,
      rules: {
        balance: "balance_from_allowance",
        bankHolidays: "bank_holidays_on_top_of_allowance",
      },
    }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "rules.entitlementDays", code: "out_of_range" }],
  });
});

test.for([367, 20.3, -1])(
  "refuses %s yearly entitlement days",
  async (entitlementDays, { orm, seed }) => {
    const termsId = await seed.defaultTermsId();
    const type = await seedTimeOffType(orm, "Study leave");

    await expect(
      timeOffPolicyService(orm).saveTimeOffPolicy(OWNER, {
        termsId,
        timeOffTypeId: type.id,
        rules: {
          balance: "balance_from_allowance",
          entitlementDays,
          bankHolidays: "bank_holidays_on_top_of_allowance",
        },
      }),
    ).rejects.toMatchObject({
      code: "INVALID_INPUT",
      fieldErrors: [{ field: "rules.entitlementDays", code: "out_of_range" }],
    });
  },
);

test("an employee cannot save an offer", async ({ orm, seed }) => {
  const termsId = await seed.defaultTermsId();
  const type = await seedTimeOffType(orm, "Study leave");

  await expect(
    timeOffPolicyService(orm).saveTimeOffPolicy(EMPLOYEE, {
      termsId,
      timeOffTypeId: type.id,
      rules: { balance: "no_balance" },
    }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(await timeOffPolicyRepository(orm).findAll()).toEqual([]);
});

test("an employee cannot update unpublished rules", async ({ orm, seed }) => {
  const termsId = await seed.defaultTermsId();
  const type = await seedTimeOffType(orm, "Study leave");
  const service = timeOffPolicyService(orm);
  const draft = await service.saveTimeOffPolicy(OWNER, {
    termsId,
    timeOffTypeId: type.id,
    rules: { balance: "no_balance" },
  });

  await expect(
    service.saveTimeOffPolicy(EMPLOYEE, {
      termsId,
      timeOffTypeId: type.id,
      rules: { balance: "unlimited_balance" },
    }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect((await timeOffPolicyRepository(orm).findAll())[0]!.versions).toEqual([draft]);
});

test.for(["termsId", "timeOffTypeId"] as const)(
  "refuses an unknown %s when saving rules",
  async (field, { orm, seed }) => {
    const termsId = await seed.defaultTermsId();
    const type = await seedTimeOffType(orm, "Study leave");

    await expect(
      timeOffPolicyService(orm).saveTimeOffPolicy(OWNER, {
        termsId,
        timeOffTypeId: type.id,
        [field]: "00000000-0000-4000-8000-000000000001",
        rules: { balance: "no_balance" },
      }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT", fieldErrors: [{ field, code: "not_found" }] });
  },
);

test("discarding unknown rules is refused", async ({ orm }) => {
  await expect(
    timeOffPolicyService(orm).discardTimeOffPolicy(OWNER, {
      versionId: "00000000-0000-4000-8000-000000000001",
    }),
  ).rejects.toMatchObject({
    code: "NOT_FOUND",
    message: "No unpublished time off rules have this id.",
  });
});
