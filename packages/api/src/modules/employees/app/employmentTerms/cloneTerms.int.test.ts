import {
  ADMIN,
  EMPLOYEE,
  expect,
  giveTermsPolicies,
  readTermsPolicyVersions,
  recordCloneService,
  seedTermsWeek,
  seedTermsPolicy,
  termsService,
  test,
  timeOffService,
  workingPatternService,
} from "#test/support";
import { locationRepository, workingPatternRepository } from "../../db";

test("clones only today's published working week as a new unpublished pattern", async ({
  orm,
  seed,
}) => {
  const id = await seed.terms("Source");
  await seedTermsWeek(orm, { termsId: id, startDate: "2026-01-01", endDate: "2026-03-31" });
  const current = await seedTermsWeek(orm, {
    termsId: id,
    startDate: "2026-04-01",
    endDate: "2026-12-31",
    minutes: [480, 480, 480, 480, 0, 0, 0],
    bankHolidayCalendar: "scotland",
  });
  await seedTermsWeek(orm, {
    termsId: id,
    startDate: "2027-01-01",
    minutes: [360, 360, 360, 360, 360, 0, 0],
    bankHolidayCalendar: "northern_ireland",
  });
  await workingPatternService(orm).saveWorkingPattern(ADMIN, {
    termsId: id,
    minutes: [300, 300, 300, 300, 300, 0, 0],
    bankHolidayCalendar: "england_and_wales",
  });
  const before = await termsService(orm).readTerms(ADMIN, id);

  const clone = await recordCloneService(orm, { today: "2026-06-01" }).cloneRecord(ADMIN, {
    recordType: "terms",
    id,
    name: "Senior staff",
  });

  const saved = await termsService(orm).readTerms(ADMIN, clone.id);
  expect(saved).toMatchObject({
    workingWeek: [],
    unpublishedWorkingWeek: {
      termsId: clone.id,
      status: "draft",
      revision: 1,
      minutes: [480, 480, 480, 480, 0, 0, 0],
      bankHolidayCalendar: "scotland",
    },
  });
  expect(saved!.unpublishedWorkingWeek!.workingPatternId).not.toBe(current.workingPatternId);
  const pattern = (await workingPatternRepository(orm).findPatterns()).find(
    ({ id }) => id === saved!.unpublishedWorkingWeek!.workingPatternId,
  )!;
  expect(pattern.versions).toHaveLength(1);
  expect(await termsService(orm).readTerms(ADMIN, id)).toEqual(before);
});

test("clones each type's current rules as unpublished copies without past or planned assignments", async ({
  orm,
  seed,
}) => {
  const id = await seed.terms("Source");
  const types = (await timeOffService(orm).listTimeOffTypes(ADMIN)).timeOffTypes.map(
    ({ timeOffType }) => timeOffType,
  );
  const annualId = types.find(({ typeKey }) => typeKey === "annual_leave")!.id;
  const sicknessId = types.find(({ typeKey }) => typeKey === "sickness")!.id;
  const current: Parameters<typeof seedTermsPolicy>[1]["version"] = {
    balance: "balance_from_allowance",
    bankHolidays: "bank_holidays_on_top_of_allowance",
    leaveYear: { kind: "leave_year_from_fixed_date", month: 1, day: 1 },
    rules: [
      { kind: "yearly_entitlement", entitlementDays: 22, entitlementDaysPerWeek: 4, maxDays: 30 },
      { kind: "service_extra", afterYears: 3, extraDays: 2 },
      { kind: "service_extra", afterYears: 5, extraDays: 4 },
    ],
  };
  await seedTermsPolicy(orm, {
    termsId: id,
    timeOffTypeId: annualId,
    version: {
      ...current,
      rules: [
        {
          kind: "yearly_entitlement",
          entitlementDays: 20,
          entitlementDaysPerWeek: 5,
          maxDays: null,
        },
      ],
    },
    startDate: "2026-01-01",
    endDate: "2026-05-31",
  });
  const source = await seedTermsPolicy(orm, {
    termsId: id,
    timeOffTypeId: annualId,
    version: current,
    startDate: "2026-06-01",
    endDate: "2026-12-31",
  });
  await seedTermsPolicy(orm, {
    termsId: id,
    timeOffTypeId: annualId,
    version: {
      ...current,
      rules: [
        { kind: "yearly_entitlement", entitlementDays: 25, entitlementDaysPerWeek: 5, maxDays: 35 },
      ],
    },
    startDate: "2027-01-01",
  });
  await seedTermsPolicy(orm, {
    termsId: id,
    timeOffTypeId: sicknessId,
    version: { balance: "no_balance", bankHolidays: null, leaveYear: null, rules: [] },
    startDate: "2026-01-01",
  });
  const before = await readTermsPolicyVersions(orm, id);

  const clone = await recordCloneService(orm, { today: "2026-06-01" }).cloneRecord(ADMIN, {
    recordType: "terms",
    id,
    name: "Senior staff",
  });

  const copied = (await timeOffService(orm).readTermsTimeOff(ADMIN, [clone.id])).get(clone.id)!;
  const annual = copied.find(({ timeOffType }) => timeOffType.id === annualId)!;
  const sickness = copied.find(({ timeOffType }) => timeOffType.id === sicknessId)!;
  expect(annual).toMatchObject({
    versions: [],
    unpublished: { ...current, status: "draft", termsId: clone.id, revision: 1 },
  });
  expect(annual.unpublished!.timeOffPolicyId).not.toBe(source.id);
  expect(sickness).toMatchObject({
    versions: [],
    unpublished: {
      balance: "no_balance",
      bankHolidays: null,
      leaveYear: null,
      rules: [],
      status: "draft",
    },
  });
  expect(copied.filter(({ unpublished }) => unpublished !== null)).toHaveLength(2);
  expect(await readTermsPolicyVersions(orm, id)).toEqual(before);
});

test("clones with a trimmed name, nobody and no locations, leaving the source unchanged", async ({
  orm,
  seed,
  transact,
}) => {
  const id = await seed.defaultTermsId();
  await seed.employee({ startDate: "2025-01-01" });
  const location = await seed.location("London");
  await locationRepository(orm).setDefaultTerms([{ locationName: "London", termsId: id }]);
  await giveTermsPolicies(orm, transact, {
    termsId: id,
    today: "2026-11-09",
    policies: [{ key: "uk_statutory_minimum" }],
  });
  const service = termsService(orm, { today: "2026-11-09" });
  const before = await service.readTerms(ADMIN, id);
  const policiesBefore = await readTermsPolicyVersions(orm, id);
  expect(before).toMatchObject({ peopleCount: 1, locations: [location] });

  const clone = await recordCloneService(orm, { today: "2026-11-09" }).cloneRecord(ADMIN, {
    recordType: "terms",
    id,
    name: "  Senior staff  ",
  });

  expect(clone).toMatchObject({
    __typename: "Terms",
    name: "Senior staff",
    isDefault: false,
    peopleCount: 0,
    locations: [],
    deleteBlocker: null,
  });
  expect(clone.id).not.toBe(id);
  expect(clone).toEqual({ ...(await service.readTerms(ADMIN, clone.id)), __typename: "Terms" });
  expect(await service.readTerms(ADMIN, id)).toEqual(before);
  expect(await readTermsPolicyVersions(orm, id)).toEqual(policiesBefore);
});

test("writes only one created history line on the clone and leaves the source history unchanged", async ({
  orm,
  seed,
}) => {
  const id = await seed.defaultTermsId();
  const service = termsService(orm, { today: "2026-11-09" });
  await service.updateTerms(ADMIN, { id, name: "Standard staff" });
  const before = await service.readTermsHistory(ADMIN, id, {});
  expect(before.edges).toHaveLength(1);

  const clone = await recordCloneService(orm, { today: "2026-11-09" }).cloneRecord(ADMIN, {
    recordType: "terms",
    id,
    name: "Senior staff",
  });

  const history = await service.readTermsHistory(ADMIN, clone.id, {});
  expect(history.edges.map(({ node }) => node)).toMatchObject([
    {
      recordType: "terms",
      recordId: clone.id,
      operation: "CREATED",
      cause: { kind: "EDITED_DIRECTLY" },
      changes: [{ field: "name", oldValue: null, newValue: "Senior staff" }],
    },
  ]);
  expect(await service.readTermsHistory(ADMIN, id, {})).toEqual(before);
});

test.for([
  { name: "   ", code: "required" },
  { name: "a".repeat(101), code: "too_long" },
])(
  "refuses a clone name with error $code without creating terms",
  async ({ name, code }, { orm, seed }) => {
    const id = await seed.defaultTermsId();
    const service = termsService(orm, { today: "2026-11-09" });
    const before = await service.listTerms(ADMIN);

    await expect(
      recordCloneService(orm, { today: "2026-11-09" }).cloneRecord(ADMIN, {
        recordType: "terms",
        id,
        name,
      }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT", fieldErrors: [{ field: "name", code }] });

    expect(await service.listTerms(ADMIN)).toEqual(before);
  },
);

test("refuses a taken clone name ignoring case and surrounding spaces without creating terms", async ({
  orm,
  seed,
}) => {
  const id = await seed.defaultTermsId();
  const service = termsService(orm, { today: "2026-11-09" });
  const before = await service.listTerms(ADMIN);

  await expect(
    recordCloneService(orm, { today: "2026-11-09" }).cloneRecord(ADMIN, {
      recordType: "terms",
      id,
      name: " england and wales ",
    }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "name", code: "taken" }],
  });

  expect(await service.listTerms(ADMIN)).toEqual(before);
});

test.for(["not-a-uuid", "00000000-0000-4000-8000-000000000001"])(
  "refuses cloning unknown terms %s without creating terms",
  async (id, { orm }) => {
    const service = termsService(orm, { today: "2026-11-09" });
    const before = await service.listTerms(ADMIN);

    await expect(
      recordCloneService(orm, { today: "2026-11-09" }).cloneRecord(ADMIN, {
        recordType: "terms",
        id,
        name: "Senior staff",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(await service.listTerms(ADMIN)).toEqual(before);
  },
);

test("refuses cloning an employee record without creating terms", async ({ orm, seed }) => {
  const { id } = await seed.employee({ startDate: "2025-01-01" });
  const service = termsService(orm, { today: "2026-11-09" });
  const before = await service.listTerms(ADMIN);

  await expect(
    recordCloneService(orm, { today: "2026-11-09" }).cloneRecord(ADMIN, {
      recordType: "employee",
      id,
      name: "Senior staff",
    }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "recordType", code: "not_cloneable" }],
  });

  expect(await service.listTerms(ADMIN)).toEqual(before);
});

test("refuses a non-admin cloning terms without creating terms", async ({ orm, seed }) => {
  const id = await seed.defaultTermsId();
  const service = termsService(orm, { today: "2026-11-09" });
  const before = await service.listTerms(ADMIN);

  await expect(
    recordCloneService(orm, { today: "2026-11-09" }).cloneRecord(EMPLOYEE, {
      recordType: "terms",
      id,
      name: "Senior staff",
    }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });

  expect(await service.listTerms(ADMIN)).toEqual(before);
});
