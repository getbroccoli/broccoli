import {
  calendarDate,
  expect,
  OWNER,
  seedTermsPolicy,
  seedTimeOffType,
  test,
  timeOffPolicyService,
} from "#test/support";
import { timeOffPolicyRepository } from "../db";
import { STANDARD_LEAVE_POLICIES } from "../domain";

test("an unticked terms' overlapping plan does not block publishing to another suggested owner", async ({
  orm,
  seed,
}) => {
  const termsId = await seed.defaultTermsId();
  const otherTermsId = await seed.terms("Other terms");
  const type = await seedTimeOffType(orm, "Study leave");
  const shared = await seedTermsPolicy(orm, {
    termsId,
    timeOffTypeId: type.id,
    version: STANDARD_LEAVE_POLICIES.uk_20_days_plus_bank_holidays,
    startDate: "2026-01-01",
    endDate: "2026-06-30",
  });
  await seedTermsPolicy(orm, {
    termsId,
    timeOffTypeId: type.id,
    version: STANDARD_LEAVE_POLICIES.uk_25_days_plus_bank_holidays,
    startDate: "2026-07-01",
  });
  const repository = timeOffPolicyRepository(orm);
  await repository.insertAssignment({
    owner: { termsId: otherTermsId },
    timeOffTypeId: type.id,
    timeOffPolicyId: shared.id,
    versionId: shared.versionId,
    startDate: calendarDate("2026-01-01"),
    endDate: null,
  });
  const before = await repository.findAssignments({ termsIds: [termsId] });
  const service = timeOffPolicyService(orm);
  const draft = await service.saveTimeOffPolicy(OWNER, {
    termsId,
    timeOffTypeId: type.id,
    rules: {
      balance: "balance_from_allowance",
      entitlementDays: 22,
      bankHolidays: "bank_holidays_on_top_of_allowance",
    },
  });

  await service.publishTerms(OWNER, {
    termsId,
    versions: [draft],
    startDate: "2026-07-01",
    owners: [{ termsId: otherTermsId }],
  });

  expect(await repository.findAssignments({ termsIds: [termsId] })).toEqual(before);
  expect(await repository.findAssignments({ termsIds: [otherTermsId] })).toMatchObject([
    { versionId: shared.versionId, startDate: "2026-01-01", endDate: "2026-06-30" },
    { versionId: draft.id, startDate: "2026-07-01", endDate: null },
  ]);
});

test("a stale revision is refused before checking the newer draft's mid-year counts change", async ({
  orm,
  seed,
}) => {
  const termsId = await seed.defaultTermsId();
  const type = await seedTimeOffType(orm, "Study leave");
  await seedTermsPolicy(orm, {
    termsId,
    timeOffTypeId: type.id,
    version: STANDARD_LEAVE_POLICIES.uk_20_days_plus_bank_holidays,
    startDate: "2026-01-01",
  });
  const repository = timeOffPolicyRepository(orm);
  const before = await repository.findAssignments({ termsIds: [termsId] });
  const service = timeOffPolicyService(orm);
  const first = await service.saveTimeOffPolicy(OWNER, {
    termsId,
    timeOffTypeId: type.id,
    rules: {
      balance: "balance_from_allowance",
      entitlementDays: 22,
      bankHolidays: "bank_holidays_on_top_of_allowance",
    },
  });
  const latest = await service.saveTimeOffPolicy(OWNER, {
    termsId,
    timeOffTypeId: type.id,
    rules: { balance: "unlimited_balance" },
  });

  await expect(
    service.publishTerms(OWNER, {
      termsId,
      versions: [first],
      startDate: "2026-07-01",
      owners: [{ termsId }],
    }),
  ).rejects.toMatchObject({
    code: "CONFLICT",
    message: "The unpublished changes on these terms changed since you opened them.",
  });

  expect(await repository.findAssignments({ termsIds: [termsId] })).toEqual(before);
  expect((await repository.findAll())[0]!.versions).toContainEqual(latest);
});
