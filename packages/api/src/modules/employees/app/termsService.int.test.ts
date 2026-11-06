import { eq } from "drizzle-orm";

import {
  ADMIN,
  calendarDate,
  EMPLOYEE,
  expect,
  seedEmploymentEnd,
  termsService,
  test,
} from "#test/support";

import { employeeTerms, locationRepository, workingPatternRepository } from "../db";

test("lists the default terms first, then others by name ignoring case", async ({ orm, seed }) => {
  const defaultId = await seed.defaultTermsId();
  const zulu = await seed.terms("Zulu");
  const alpha = await seed.terms("alpha");
  const service = termsService(orm, { today: "2026-11-06" });

  const result = await service.listTerms(ADMIN);

  expect(result.map(({ id, isDefault }) => ({ id, isDefault }))).toEqual([
    { id: defaultId, isDefault: true },
    { id: alpha, isDefault: false },
    { id: zulu, isDefault: false },
  ]);
});

test("counts people on each terms today, excluding future memberships", async ({ orm, seed }) => {
  const defaultId = await seed.defaultTermsId();
  const otherId = await seed.terms("Scotland");
  const moving = await seed.employee({ startDate: "2025-01-01" });
  const moved = await seed.employee({ startDate: "2025-01-01" });
  await seed.moveToTerms(moved.id, otherId, "2026-11-06");
  await orm
    .update(employeeTerms)
    .set({ endDate: calendarDate("2026-11-06") })
    .where(eq(employeeTerms.employeeId, moving.id));
  await orm.insert(employeeTerms).values({
    employeeId: moving.id,
    termsId: otherId,
    startDate: calendarDate("2026-11-07"),
  });
  const service = termsService(orm, { today: "2026-11-06" });

  const result = await service.listTerms(ADMIN);

  expect(result.map(({ id, peopleCount }) => ({ id, peopleCount }))).toEqual([
    { id: defaultId, peopleCount: 1 },
    { id: otherId, peopleCount: 1 },
  ]);
});

test("does not count a person whose employment starts after today", async ({ orm, seed }) => {
  const id = await seed.defaultTermsId();
  await seed.employee({ startDate: "2026-11-07" });
  const service = termsService(orm, { today: "2026-11-06" });

  const result = await service.listTerms(ADMIN);

  expect(result).toMatchObject([{ id, peopleCount: 0 }]);
});

test("does not count a person whose employment ended before today", async ({ orm, seed }) => {
  const id = await seed.defaultTermsId();
  const employee = await seed.employee({ startDate: "2025-01-01" });
  await seedEmploymentEnd(orm, employee.id, "2026-11-05");
  const service = termsService(orm, { today: "2026-11-06" });

  const result = await service.listTerms(ADMIN);

  expect(result).toMatchObject([{ id, peopleCount: 0 }]);
});

test("gives the default terms unassigned locations and each other terms only their own", async ({
  orm,
  seed,
}) => {
  const defaultId = await seed.defaultTermsId();
  const scotland = await seed.terms("Scotland");
  const york = await seed.location("York");
  const glasgow = await seed.location("Glasgow");
  const leeds = await seed.location("Leeds");
  await locationRepository(orm).setDefaultTerms([
    { locationName: "York", termsId: defaultId },
    { locationName: "Glasgow", termsId: scotland },
  ]);
  const service = termsService(orm, { today: "2026-11-06" });

  const result = await service.listTerms(ADMIN);

  expect(result.map(({ id, locations }) => ({ id, locations }))).toMatchObject([
    {
      id: defaultId,
      locations: [
        { id: leeds.id, name: "Leeds" },
        { id: york.id, name: "York" },
      ],
    },
    { id: scotland, locations: [{ id: glasgow.id, name: "Glasgow" }] },
  ]);
});

test("shows today's working week followed by planned versions, leaving past versions out", async ({
  orm,
  seed,
}) => {
  const defaultId = await seed.defaultTermsId();
  const patterns = workingPatternRepository(orm);
  const pattern = (await patterns.findPatterns()).find(({ termsId }) => termsId === defaultId)!;
  const { id: pastId, ...week } = pattern.versions[0]!;
  await patterns.endVersion(pastId, calendarDate("2026-11-05"));
  await patterns.insertVersion(pattern.id, {
    ...week,
    startDate: calendarDate("2027-01-01"),
    endDate: null,
    minutes: [480, 480, 480, 480, 0, 0, 0],
    fullDayMinutes: 480,
  });
  await patterns.insertVersion(pattern.id, {
    ...week,
    startDate: calendarDate("2026-11-06"),
    endDate: calendarDate("2026-12-31"),
  });
  const service = termsService(orm, { today: "2026-11-06" });

  const result = await service.listTerms(ADMIN);

  expect(result.find(({ id }) => id === defaultId)!.workingWeek).toMatchObject([
    { startDate: "2026-11-06", endDate: "2026-12-31", minutes: [450, 450, 450, 450, 450, 0, 0] },
    { startDate: "2027-01-01", endDate: null, minutes: [480, 480, 480, 480, 0, 0, 0] },
  ]);
});

test("reads one terms by id", async ({ orm, seed }) => {
  const id = await seed.terms("Scotland");
  const service = termsService(orm, { today: "2026-11-06" });

  const result = await service.readTerms(ADMIN, id);

  expect(result).toMatchObject({ id, name: "Scotland", isDefault: false, peopleCount: 0 });
});

test("returns null for an unknown terms id", async ({ orm }) => {
  const service = termsService(orm, { today: "2026-11-06" });

  const result = await service.readTerms(ADMIN, "00000000-0000-4000-8000-000000000001");

  expect(result).toBeNull();
});

test("refuses an employee listing terms", async ({ orm }) => {
  const service = termsService(orm, { today: "2026-11-06" });

  await expect(service.listTerms(EMPLOYEE)).rejects.toMatchObject({ code: "FORBIDDEN" });
});

test("refuses an employee reading one terms", async ({ orm, seed }) => {
  const id = await seed.defaultTermsId();
  const service = termsService(orm, { today: "2026-11-06" });

  await expect(service.readTerms(EMPLOYEE, id)).rejects.toMatchObject({ code: "FORBIDDEN" });
});
