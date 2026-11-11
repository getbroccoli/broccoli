import {
  calendarDate,
  EMPLOYEE,
  expect,
  OWNER,
  giveTermsPolicies,
  readTermsPolicies,
  seedTermsPolicy,
  seedTimeOffType,
  test,
  timeOffPolicyService,
  workingPatternService,
} from "#test/support";
import { timeOffPolicyRepository } from "../db";
import { RECORD_ONLY_POLICY } from "../domain";

test("publishing terms without unpublished versions is refused", async ({ orm, seed }) => {
  const termsId = await seed.defaultTermsId();

  await expect(
    timeOffPolicyService(orm).publishTerms(OWNER, {
      termsId,
      versions: [],
      startDate: "2026-01-01",
      owners: [{ termsId }],
    }),
  ).rejects.toMatchObject({
    code: "CONFLICT",
    message: "These terms have nothing to publish.",
  });
});

test("a draft saved again since review refuses the whole publish", async ({ orm, seed }) => {
  const termsId = await seed.defaultTermsId();
  const type = await seedTimeOffType(orm, "Study leave");
  const service = timeOffPolicyService(orm);
  const first = await service.saveTimeOffPolicy(OWNER, {
    termsId,
    timeOffTypeId: type.id,
    rules: { balance: "no_balance" },
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
      startDate: "2026-01-01",
      owners: [{ termsId }],
    }),
  ).rejects.toMatchObject({
    code: "CONFLICT",
    message: "These changes were saved again since you opened them.",
  });
  expect((await timeOffPolicyRepository(orm).findAll())[0]!.versions).toEqual([latest]);
  expect(await timeOffPolicyRepository(orm).findAssignments({ termsIds: [termsId] })).toEqual([]);
});

test("leaving out a newly saved section refuses the whole publish", async ({ orm, seed }) => {
  const termsId = await seed.defaultTermsId();
  const type = await seedTimeOffType(orm, "Study leave");
  const service = timeOffPolicyService(orm);
  const draft = await service.saveTimeOffPolicy(OWNER, {
    termsId,
    timeOffTypeId: type.id,
    rules: { balance: "no_balance" },
  });
  await workingPatternService(orm).saveWorkingPattern(OWNER, {
    termsId,
    minutes: [450, 450, 450, 450, 0, 0, 0],
    bankHolidayCalendar: "england_and_wales",
  });

  await expect(
    service.publishTerms(OWNER, {
      termsId,
      versions: [draft],
      startDate: "2026-01-01",
      owners: [{ termsId }],
    }),
  ).rejects.toMatchObject({
    code: "CONFLICT",
    message: "These changes were saved again since you opened them.",
  });
  expect(await timeOffPolicyRepository(orm).findAssignments({ termsIds: [termsId] })).toEqual([]);
});

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

test("publish checks how leave counts at a later assignment's start", async ({ orm, seed }) => {
  const termsId = await seed.defaultTermsId();
  const otherTermsId = await seed.terms("Other terms");
  const type = await seedTimeOffType(orm, "Study leave");
  const shared = await seedTermsPolicy(orm, {
    termsId,
    timeOffTypeId: type.id,
    version: RECORD_ONLY_POLICY,
    startDate: "2026-01-01",
  });
  await seedTermsPolicy(orm, {
    termsId: otherTermsId,
    timeOffTypeId: type.id,
    version: RECORD_ONLY_POLICY,
    startDate: "2026-01-01",
    endDate: "2026-06-30",
  });
  await timeOffPolicyRepository(orm).insertAssignment({
    owner: { termsId: otherTermsId },
    timeOffTypeId: type.id,
    timeOffPolicyId: shared.id,
    versionId: shared.versionId,
    startDate: calendarDate("2026-07-01"),
    endDate: null,
  });
  const service = timeOffPolicyService(orm);
  const draft = await service.saveTimeOffPolicy(OWNER, {
    termsId,
    timeOffTypeId: type.id,
    rules: { balance: "unlimited_balance" },
  });
  const before = await timeOffPolicyRepository(orm).findAssignments({
    termsIds: [termsId, otherTermsId],
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
    fieldErrors: [{ field: "rules.balance", code: "not_leave_year_start" }],
  });
  expect(
    await timeOffPolicyRepository(orm).findAssignments({ termsIds: [termsId, otherTermsId] }),
  ).toEqual(before);
  expect(
    (await timeOffPolicyRepository(orm).findAll()).flatMap(({ versions }) => versions),
  ).toContainEqual(draft);
});

test("publish checks how leave counts at the chosen date", async ({ orm, seed, transact }) => {
  const termsId = await seed.defaultTermsId();
  await giveTermsPolicies(orm, transact, {
    termsId,
    policies: [{ key: "uk_20_days_plus_bank_holidays" }],
  });
  const [policy] = await readTermsPolicies(orm, termsId);
  const service = timeOffPolicyService(orm);
  const draft = await service.saveTimeOffPolicy(OWNER, {
    termsId,
    timeOffTypeId: policy!.timeOffTypeId,
    rules: { balance: "unlimited_balance" },
  });

  await expect(
    service.publishTerms(OWNER, {
      termsId,
      versions: [draft],
      startDate: "2026-07-01",
      owners: [{ termsId }],
    }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "rules.balance", code: "not_leave_year_start" }],
  });
});

test("an offer that would overlap a later unrelated policy is refused", async ({ orm, seed }) => {
  const termsId = await seed.defaultTermsId();
  const type = await seedTimeOffType(orm, "Study leave");
  await seedTermsPolicy(orm, {
    termsId,
    timeOffTypeId: type.id,
    version: RECORD_ONLY_POLICY,
    startDate: "2027-01-01",
  });
  const service = timeOffPolicyService(orm);
  const draft = await service.saveTimeOffPolicy(OWNER, {
    termsId,
    timeOffTypeId: type.id,
    rules: { balance: "no_balance" },
  });
  const before = await timeOffPolicyRepository(orm).findAssignments({ termsIds: [termsId] });

  await expect(
    service.publishTerms(OWNER, {
      termsId,
      versions: [draft],
      startDate: "2026-12-01",
      owners: [{ termsId }],
    }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "endDate", code: "overlaps" }],
  });
  expect(await timeOffPolicyRepository(orm).findAssignments({ termsIds: [termsId] })).toEqual(
    before,
  );
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
