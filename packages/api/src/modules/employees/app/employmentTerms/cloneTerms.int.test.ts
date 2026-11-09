import {
  ADMIN,
  calendarDate,
  EMPLOYEE,
  expect,
  giveTermsPolicies,
  readTermsPolicyVersions,
  recordCloneService,
  seedTimeOffPolicyVersions,
  termsService,
  test,
} from "#test/support";

import { locationRepository, workingPatternRepository } from "../../db";

test("clones today's working week from the beginning and keeps planned weeks, leaving past weeks out", async ({
  orm,
  seed,
}) => {
  const id = await seed.defaultTermsId();
  const patterns = workingPatternRepository(orm);
  const pattern = (await patterns.findPatterns()).find(({ termsId }) => termsId === id)!;
  const { id: pastId, ...week } = pattern.versions[0]!;
  await patterns.endVersion(pastId, calendarDate("2026-03-31"));
  await patterns.insertVersion(pattern.id, {
    ...week,
    startDate: calendarDate("2026-04-01"),
    endDate: calendarDate("2026-12-31"),
    minutes: [480, 480, 480, 480, 0, 0, 0],
    bankHolidayCalendar: "scotland",
  });
  await patterns.insertVersion(pattern.id, {
    ...week,
    startDate: calendarDate("2027-01-01"),
    endDate: null,
    minutes: [360, 360, 360, 360, 360, 0, 0],
    bankHolidayCalendar: "northern_ireland",
  });
  const before = (await patterns.findPatterns()).find(({ termsId }) => termsId === id);

  const clone = await recordCloneService(orm, { today: "2026-11-09" }).cloneRecord(ADMIN, {
    recordType: "terms",
    id,
    name: "Senior staff",
  });

  const saved = await termsService(orm, { today: "2026-11-09" }).readTerms(ADMIN, clone.id);
  expect(saved!.workingWeek).toMatchObject([
    {
      startDate: null,
      endDate: "2026-12-31",
      minutes: [480, 480, 480, 480, 0, 0, 0],
      bankHolidayCalendar: "scotland",
    },
    {
      startDate: "2027-01-01",
      endDate: null,
      minutes: [360, 360, 360, 360, 360, 0, 0],
      bankHolidayCalendar: "northern_ireland",
    },
  ]);
  expect(
    (await patterns.findPatterns()).find(({ termsId }) => termsId === clone.id)!.versions,
  ).toHaveLength(2);
  expect((await patterns.findPatterns()).find(({ termsId }) => termsId === id)).toEqual(before);
});

test("clones each offered type's current and planned rules from the current leave year, leaving ended rules out", async ({
  orm,
  seed,
  transact,
}) => {
  const id = await seed.defaultTermsId();
  await giveTermsPolicies(orm, transact, {
    termsId: id,
    today: "2026-11-09",
    policies: [{ key: "uk_statutory_minimum" }, { recordOnly: "sickness" }],
  });
  const annual = (await readTermsPolicyVersions(orm, id)).find(
    (policy) => policy.timeOffType.typeKey === "annual_leave",
  )!;
  const { id: pastId, ...past } = annual.versions[0]!;
  const current = {
    ...past,
    startDate: calendarDate("2026-06-01"),
    endDate: calendarDate("2026-12-31"),
    bankHolidays: "bank_holidays_on_top_of_allowance" as const,
    rules: [
      {
        kind: "yearly_entitlement" as const,
        entitlementDays: 22,
        entitlementDaysPerWeek: 4,
        maxDays: 30,
      },
      { kind: "service_extra" as const, afterYears: 3, extraDays: 2 },
      { kind: "service_extra" as const, afterYears: 5, extraDays: 4 },
    ],
  };
  const planned = {
    ...current,
    startDate: calendarDate("2027-01-01"),
    endDate: null,
    rules: [
      {
        kind: "yearly_entitlement" as const,
        entitlementDays: 25,
        entitlementDaysPerWeek: 5,
        maxDays: 35,
      },
      { kind: "service_extra" as const, afterYears: 4, extraDays: 3 },
    ],
  };
  await seedTimeOffPolicyVersions(orm, {
    policyId: annual.id,
    past: { id: pastId, endDate: calendarDate("2026-05-31") },
    versions: [current, planned],
  });
  const before = await readTermsPolicyVersions(orm, id);

  const clone = await recordCloneService(orm, { today: "2026-11-09" }).cloneRecord(ADMIN, {
    recordType: "terms",
    id,
    name: "Senior staff",
  });

  const copied = await readTermsPolicyVersions(orm, clone.id);
  expect(copied.map(({ timeOffType }) => timeOffType.typeKey).sort()).toEqual([
    "annual_leave",
    "sickness",
  ]);
  expect(
    copied.find(({ timeOffType }) => timeOffType.typeKey === "annual_leave")!.versions,
  ).toMatchObject([{ ...current, startDate: "2026-01-01" }, planned]);
  expect(
    copied.find(({ timeOffType }) => timeOffType.typeKey === "sickness")!.versions,
  ).toMatchObject([
    {
      startDate: "2026-01-01",
      endDate: null,
      balance: "no_balance",
      bankHolidays: null,
      leaveYear: null,
      rules: [],
    },
  ]);
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
