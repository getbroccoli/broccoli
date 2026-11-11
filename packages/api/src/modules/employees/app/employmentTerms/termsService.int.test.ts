import { eq, sql } from "drizzle-orm";

import {
  ADMIN,
  calendarDate,
  EMPLOYEE,
  expect,
  expectBlockedBy,
  seedEmploymentEnd,
  seedTermsWeek,
  termsService,
  test,
  timeOffService,
} from "#test/support";

import { ormOf } from "../../../../core/db";
import { employeeTerms, locationRepository, termsRepository } from "../../db";

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

test("shows today's working week followed by planned assignments, leaving past assignments out", async ({
  orm,
  seed,
}) => {
  const termsId = await seed.terms("Scotland");
  await seedTermsWeek(orm, { termsId, startDate: "2026-01-01", endDate: "2026-05-31" });
  const current = await seedTermsWeek(orm, {
    termsId,
    startDate: "2026-06-01",
    endDate: "2026-12-31",
  });
  const planned = await seedTermsWeek(orm, {
    termsId,
    startDate: "2027-01-01",
    minutes: [480, 480, 480, 480, 0, 0, 0],
  });

  const result = await termsService(orm).listTerms(ADMIN);

  expect(result.find(({ id }) => id === termsId)!.workingWeek).toMatchObject([
    {
      id: current.assignmentId,
      startDate: "2026-06-01",
      endDate: "2026-12-31",
      version: { minutes: [450, 450, 450, 450, 450, 0, 0] },
    },
    {
      id: planned.assignmentId,
      startDate: "2027-01-01",
      endDate: null,
      version: { minutes: [480, 480, 480, 480, 0, 0, 0] },
    },
  ]);
});

test("reads one terms by id", async ({ orm, seed }) => {
  const id = await seed.terms("Scotland");
  const service = termsService(orm, { today: "2026-11-06" });

  const result = await service.readTerms(ADMIN, id);

  expect(result).toMatchObject({ id, name: "Scotland", isDefault: false, peopleCount: 0 });
});

test("reports that nobody was ever on newly created terms", async ({ orm, seed }) => {
  const id = await seed.terms("Senior staff");
  const service = termsService(orm, { today: "2026-11-06" });

  const terms = await service.readTerms(ADMIN, id);
  const allTerms = await service.listTerms(ADMIN);

  expect(terms).toMatchObject({ id, hadPeople: false });
  expect(allTerms.find((terms) => terms.id === id)).toMatchObject({ hadPeople: false });
});

test("reports past membership after the only person moved to other terms", async ({
  orm,
  seed,
}) => {
  const id = await seed.defaultTermsId();
  const otherId = await seed.terms("Senior staff");
  const employee = await seed.employee({ startDate: "2025-01-01" });
  await orm
    .update(employeeTerms)
    .set({ endDate: calendarDate("2026-11-04") })
    .where(eq(employeeTerms.employeeId, employee.id));
  await orm.insert(employeeTerms).values({
    employeeId: employee.id,
    termsId: otherId,
    startDate: calendarDate("2026-11-05"),
  });
  const service = termsService(orm, { today: "2026-11-06" });

  const terms = await service.readTerms(ADMIN, id);
  const allTerms = await service.listTerms(ADMIN);

  expect(terms).toMatchObject({ id, peopleCount: 0, hadPeople: true });
  expect(allTerms.find((terms) => terms.id === id)).toMatchObject({
    peopleCount: 0,
    hadPeople: true,
  });
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

test("deleting terms while a type is offered on them settles without a deadlock", async ({
  orm,
  seed,
  transact,
}) => {
  const termsId = await seed.terms("Scotland");
  const offerReady = Promise.withResolvers<number>();
  const releaseOffer = Promise.withResolvers<void>();
  // Offering a type holds the time off rules, then checks the terms' row by key.
  const offering = transact(async (tx) => {
    await timeOffService(orm, { today: "2026-11-06" }).lockPolicies(ADMIN, tx);
    const { rows } = await ormOf(tx).execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
    offerReady.resolve(rows[0]!.pid);
    await releaseOffer.promise;
    await termsRepository(tx).keep(termsId);
  });
  const blockingPid = await offerReady.promise;

  const results = Promise.allSettled([
    offering,
    termsService(orm, { today: "2026-11-06" }).deleteTerms(ADMIN, { id: termsId }),
  ]);
  try {
    await expectBlockedBy(orm, blockingPid);
  } finally {
    releaseOffer.resolve();
    await results;
  }

  const [offer, deletion] = await results;
  expect(offer.status).toBe("fulfilled");
  expect(deletion.status).toBe("fulfilled");
});

test("refuses deleting terms a location chose while the delete was checking", async ({
  orm,
  seed,
  transact,
}) => {
  const id = await seed.terms("Senior staff");
  await seed.location("Glasgow");
  const choiceReady = Promise.withResolvers<number>();
  const releaseChoice = Promise.withResolvers<void>();
  const choosing = transact(async (tx) => {
    await locationRepository(tx).setDefaultTerms([{ locationName: "Glasgow", termsId: id }]);
    const { rows } = await ormOf(tx).execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
    choiceReady.resolve(rows[0]!.pid);
    await releaseChoice.promise;
  });
  const blockingPid = await choiceReady.promise;

  const deleting = termsService(orm, { today: "2026-11-06" }).deleteTerms(ADMIN, { id });
  const results = Promise.allSettled([choosing, deleting]);
  try {
    await expectBlockedBy(orm, blockingPid);
  } finally {
    releaseChoice.resolve();
    await results;
  }

  await expect(deleting).rejects.toMatchObject({
    code: "CONFLICT",
    message:
      "Glasgow starts new people here. Choose other terms for it in Settings › Locations first.",
  });
});
