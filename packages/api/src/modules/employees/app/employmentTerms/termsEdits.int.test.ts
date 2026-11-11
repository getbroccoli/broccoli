import { eq } from "drizzle-orm";

import {
  ADMIN,
  calendarDate,
  EMPLOYEE,
  expect,
  giveTermsPolicies,
  termsService,
  test,
  timeOffService,
} from "#test/support";

import { employeeTerms, locationRepository } from "../../db";

test("creates trimmed terms with the chosen bank holidays and an unpublished Monday to Friday week", async ({
  orm,
}) => {
  const service = termsService(orm, { today: "2026-11-06" });

  const created = await service.createTerms(ADMIN, {
    name: "  Senior staff  ",
    bankHolidayCalendar: "scotland",
  });

  expect(created).toMatchObject({
    name: "Senior staff",
    isDefault: false,
    peopleCount: 0,
    locations: [],
    deleteBlocker: null,
    workingWeek: [],
    earliestChange: "2026-01-01",
    unpublishedWorkingWeek: {
      status: "draft",
      revision: 1,
      minutes: [450, 450, 450, 450, 450, 0, 0],
      bankHolidayCalendar: "scotland",
    },
  });
  expect(await service.readTerms(ADMIN, created.id)).toEqual(created);
  expect(await service.listTerms(ADMIN)).toContainEqual(created);
});

test("offers no time off type on new terms", async ({ orm }) => {
  const created = await termsService(orm, { today: "2026-11-06" }).createTerms(ADMIN, {
    name: "Senior staff",
    bankHolidayCalendar: "scotland",
  });

  const result = await timeOffService(orm).readTermsTimeOff(ADMIN, [created.id]);

  expect(
    result
      .get(created.id)!
      .map(({ timeOffType, versions }) => ({ name: timeOffType.name, versions })),
  ).toEqual([
    { name: "Annual leave", versions: [] },
    { name: "Sickness", versions: [] },
    { name: "Family leave", versions: [] },
    { name: "Other", versions: [] },
  ]);
});

test.for([
  { name: "   ", code: "required" },
  { name: "a".repeat(101), code: "too_long" },
])("refuses a new terms name with error $code", async ({ name, code }, { orm, seed }) => {
  const id = await seed.defaultTermsId();
  const service = termsService(orm, { today: "2026-11-06" });
  const before = await service.readTerms(ADMIN, id);

  await expect(
    service.createTerms(ADMIN, { name, bankHolidayCalendar: "scotland" }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT", fieldErrors: [{ field: "name", code }] });

  expect(await service.readTerms(ADMIN, id)).toEqual(before);
  expect(await service.listTerms(ADMIN)).toEqual([before]);
});

test("refuses creating a name other terms have, ignoring case and surrounding spaces", async ({
  orm,
  seed,
}) => {
  const id = await seed.terms("Scotland");
  const service = termsService(orm, { today: "2026-11-06" });

  await expect(
    service.createTerms(ADMIN, { name: " scotland ", bankHolidayCalendar: "scotland" }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "name", code: "taken" }],
  });

  expect(await service.readTerms(ADMIN, id)).toMatchObject({ id, name: "Scotland" });
  expect(await service.listTerms(ADMIN)).toHaveLength(2);
});

test("writes one created history line naming the terms", async ({ orm }) => {
  const service = termsService(orm, { today: "2026-11-06" });

  const created = await service.createTerms(ADMIN, {
    name: "Senior staff",
    bankHolidayCalendar: "scotland",
  });

  const history = await service.readTermsHistory(ADMIN, created.id, {});
  expect(history.edges.map(({ node }) => node)).toMatchObject([
    {
      recordType: "terms",
      recordId: created.id,
      operation: "CREATED",
      cause: { kind: "EDITED_DIRECTLY" },
      changes: [{ field: "name", oldValue: null, newValue: "Senior staff" }],
    },
  ]);
});

test("renames the default terms", async ({ orm, seed }) => {
  const id = await seed.defaultTermsId();
  const service = termsService(orm, { today: "2026-11-06" });

  const renamed = await service.updateTerms(ADMIN, { id, name: "  Senior team  " });

  expect(renamed).toMatchObject({ id, name: "Senior team", isDefault: true });
  expect(await service.readTerms(ADMIN, id)).toEqual(renamed);
});

test("allows renaming terms to their own name in another case", async ({ orm, seed }) => {
  const id = await seed.terms("Senior staff");
  const service = termsService(orm, { today: "2026-11-06" });

  const renamed = await service.updateTerms(ADMIN, { id, name: "SENIOR STAFF" });

  expect(renamed).toMatchObject({ id, name: "SENIOR STAFF" });
  expect(await service.readTerms(ADMIN, id)).toEqual(renamed);
});

test("refuses renaming to a name other terms have", async ({ orm, seed }) => {
  const scotland = await seed.terms("Scotland");
  const id = await seed.terms("Senior staff");
  const service = termsService(orm, { today: "2026-11-06" });

  await expect(service.updateTerms(ADMIN, { id, name: " SCOTLAND " })).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "name", code: "taken" }],
  });

  expect(await service.readTerms(ADMIN, id)).toMatchObject({ id, name: "Senior staff" });
  expect(await service.readTerms(ADMIN, scotland)).toMatchObject({
    id: scotland,
    name: "Scotland",
  });
});

test("refuses a null name on rename", async ({ orm, seed }) => {
  const id = await seed.terms("Senior staff");
  const service = termsService(orm, { today: "2026-11-06" });

  await expect(service.updateTerms(ADMIN, { id, name: null })).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "name", code: "required" }],
  });

  expect(await service.readTerms(ADMIN, id)).toMatchObject({ id, name: "Senior staff" });
});

test("writes one renamed history line", async ({ orm, seed }) => {
  const id = await seed.terms("Senior staff");
  const service = termsService(orm, { today: "2026-11-06" });

  await service.updateTerms(ADMIN, { id, name: "Senior team" });

  const history = await service.readTermsHistory(ADMIN, id, {});
  expect(history.edges.map(({ node }) => node)).toMatchObject([
    {
      recordType: "terms",
      recordId: id,
      operation: "UPDATED",
      cause: { kind: "EDITED_DIRECTLY" },
      changes: [{ field: "name", oldValue: "Senior staff", newValue: "Senior team" }],
    },
  ]);
});

test("writes no history when the name stays the same", async ({ orm, seed }) => {
  const id = await seed.terms("Senior staff");
  const service = termsService(orm, { today: "2026-11-06" });

  await service.updateTerms(ADMIN, { id, name: "Senior staff" });

  expect((await service.readTermsHistory(ADMIN, id, {})).edges).toEqual([]);
  expect(await service.readTerms(ADMIN, id)).toMatchObject({ id, name: "Senior staff" });
});

test.for(["not-a-uuid", "00000000-0000-4000-8000-000000000001"])(
  "refuses renaming unknown terms %s",
  async (id, { orm, seed }) => {
    const existing = await seed.terms("Senior staff");
    const service = termsService(orm, { today: "2026-11-06" });

    await expect(service.updateTerms(ADMIN, { id, name: "Senior team" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });

    expect(await service.readTerms(ADMIN, existing)).toMatchObject({
      id: existing,
      name: "Senior staff",
    });
  },
);

test.for(["not-a-uuid", "00000000-0000-4000-8000-000000000001"])(
  "refuses deleting unknown terms %s",
  async (id, { orm, seed }) => {
    const existing = await seed.terms("Senior staff");
    const service = termsService(orm, { today: "2026-11-06" });

    await expect(service.deleteTerms(ADMIN, { id })).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(await service.readTerms(ADMIN, existing)).toMatchObject({
      id: existing,
      name: "Senior staff",
    });
  },
);

test("deletes terms nobody was ever on even with an offered type", async ({ orm, transact }) => {
  const service = termsService(orm, { today: "2026-11-06" });
  const { id } = await service.createTerms(ADMIN, {
    name: "Senior staff",
    bankHolidayCalendar: "scotland",
  });
  await giveTermsPolicies(orm, transact, {
    termsId: id,
    policies: [{ key: "uk_statutory_minimum" }],
  });

  expect(await service.deleteTerms(ADMIN, { id })).toEqual({ deletedTermsId: id });

  expect(await service.readTerms(ADMIN, id)).toBeNull();
  expect((await service.listTerms(ADMIN)).some((terms) => terms.id === id)).toBe(false);
  expect(
    (await timeOffService(orm).readTermsTimeOff(ADMIN, [id]))
      .get(id)!
      .map(({ versions }) => versions),
  ).toEqual([[], [], [], []]);
  const history = await service.readTermsHistory(ADMIN, id, {});
  expect(history.edges[0]!.node).toMatchObject({
    operation: "DELETED",
    cause: { kind: "EDITED_DIRECTLY" },
    changes: [{ field: "name", oldValue: "Senior staff", newValue: null }],
  });
});

test("refuses deleting the default terms", async ({ orm, seed }) => {
  const id = await seed.defaultTermsId();
  const service = termsService(orm, { today: "2026-11-06" });
  const before = await service.readTerms(ADMIN, id);

  await expect(service.deleteTerms(ADMIN, { id })).rejects.toMatchObject({
    code: "CONFLICT",
    message: "The default terms stay, because people without a location start on them.",
  });

  expect(await service.readTerms(ADMIN, id)).toEqual(before);
  expect(before).toMatchObject({ deleteBlocker: "default_terms" });
  expect(await service.listTerms(ADMIN)).toContainEqual(before);
});

test("refuses deleting terms someone was on only in the past", async ({ orm, seed }) => {
  const id = await seed.terms("Senior staff");
  const employee = await seed.employee({ startDate: "2025-01-01" });
  await seed.moveToTerms(employee.id, id, "2025-01-01");
  await orm
    .update(employeeTerms)
    .set({ endDate: calendarDate("2026-11-05") })
    .where(eq(employeeTerms.employeeId, employee.id));
  const service = termsService(orm, { today: "2026-11-06" });

  await expect(service.deleteTerms(ADMIN, { id })).rejects.toMatchObject({
    code: "CONFLICT",
    message: "Terms people were on stay, so their history stays true.",
  });

  const saved = await service.readTerms(ADMIN, id);
  expect(saved).toMatchObject({
    id,
    name: "Senior staff",
    peopleCount: 0,
    deleteBlocker: "terms_had_people",
  });
  expect(await service.listTerms(ADMIN)).toContainEqual(saved);
});

test("refuses deleting terms a location starts people on, naming the location", async ({
  orm,
  seed,
}) => {
  const id = await seed.terms("Senior staff");
  const location = await seed.location("Glasgow");
  await locationRepository(orm).setDefaultTerms([{ locationName: "Glasgow", termsId: id }]);
  const service = termsService(orm, { today: "2026-11-06" });

  await expect(service.deleteTerms(ADMIN, { id })).rejects.toMatchObject({
    code: "CONFLICT",
    message:
      "Glasgow starts new people here. Choose other terms for it in Settings › Locations first.",
  });

  const saved = await service.readTerms(ADMIN, id);
  expect(saved).toMatchObject({
    id,
    name: "Senior staff",
    locations: [location],
    deleteBlocker: "location_starts_people_on_terms",
  });
  expect(await service.listTerms(ADMIN)).toContainEqual(saved);
});

test("refuses an employee creating terms", async ({ orm, seed }) => {
  const id = await seed.defaultTermsId();
  const service = termsService(orm, { today: "2026-11-06" });
  const before = await service.readTerms(ADMIN, id);

  await expect(
    service.createTerms(EMPLOYEE, { name: "Senior staff", bankHolidayCalendar: "scotland" }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });

  expect(await service.readTerms(ADMIN, id)).toEqual(before);
  expect(await service.listTerms(ADMIN)).toEqual([before]);
});

test("refuses an employee renaming terms", async ({ orm, seed }) => {
  const id = await seed.terms("Senior staff");
  const service = termsService(orm, { today: "2026-11-06" });

  await expect(service.updateTerms(EMPLOYEE, { id, name: "Senior team" })).rejects.toMatchObject({
    code: "FORBIDDEN",
  });

  expect(await service.readTerms(ADMIN, id)).toMatchObject({ id, name: "Senior staff" });
});

test("refuses an employee deleting terms", async ({ orm, seed }) => {
  const id = await seed.terms("Senior staff");
  const service = termsService(orm, { today: "2026-11-06" });

  await expect(service.deleteTerms(EMPLOYEE, { id })).rejects.toMatchObject({ code: "FORBIDDEN" });

  expect(await service.readTerms(ADMIN, id)).toMatchObject({ id, name: "Senior staff" });
});
