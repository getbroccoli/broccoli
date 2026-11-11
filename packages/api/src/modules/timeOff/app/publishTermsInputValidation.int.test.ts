import {
  EMPLOYEE,
  expect,
  OWNER,
  seedTimeOffType,
  test,
  timeOffPolicyService,
} from "#test/support";
import { timeOffPolicyRepository } from "../db";

test("publish refuses an owner that does not use the policy", async ({ orm, seed }) => {
  const termsId = await seed.defaultTermsId();
  const otherTermsId = await seed.terms("Other terms");
  const type = await seedTimeOffType(orm, "Study leave");
  const service = timeOffPolicyService(orm);
  const draft = await service.saveTimeOffPolicy(OWNER, {
    termsId,
    timeOffTypeId: type.id,
    rules: { balance: "no_balance" },
  });

  await expect(
    service.publishTerms(OWNER, {
      termsId,
      versions: [draft],
      startDate: "2026-01-01",
      owners: [{ termsId }, { termsId: otherTermsId }],
    }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "owners", code: "not_using_policy" }],
  });
  expect(
    await timeOffPolicyRepository(orm).findAssignments({ termsIds: [termsId, otherTermsId] }),
  ).toEqual([]);
});

test("publish cannot apply changes before the current year", async ({ orm, seed }) => {
  const termsId = await seed.defaultTermsId();
  const type = await seedTimeOffType(orm, "Study leave");
  const service = timeOffPolicyService(orm);
  const draft = await service.saveTimeOffPolicy(OWNER, {
    termsId,
    timeOffTypeId: type.id,
    rules: { balance: "no_balance" },
  });

  await expect(
    service.publishTerms(OWNER, {
      termsId,
      versions: [draft],
      startDate: "2025-12-31",
      owners: [{ termsId }],
    }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "startDate", code: "too_early" }],
  });
});

test("an employee cannot publish terms", async ({ orm, seed }) => {
  const termsId = await seed.defaultTermsId();
  const type = await seedTimeOffType(orm, "Study leave");
  const service = timeOffPolicyService(orm);
  const draft = await service.saveTimeOffPolicy(OWNER, {
    termsId,
    timeOffTypeId: type.id,
    rules: { balance: "no_balance" },
  });

  await expect(
    service.publishTerms(EMPLOYEE, {
      termsId,
      versions: [draft],
      startDate: "2026-01-01",
      owners: [{ termsId }],
    }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
});

test("publishing unknown terms is refused", async ({ orm }) => {
  const termsId = "00000000-0000-4000-8000-000000000001";

  await expect(
    timeOffPolicyService(orm).publishTerms(OWNER, {
      termsId,
      versions: [],
      startDate: "2026-01-01",
      owners: [{ termsId }],
    }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "termsId", code: "not_found" }],
  });
});
