import {
  employeeServices,
  expect,
  OWNER,
  seedTermsPeriods,
  termsChangedEvents,
  test,
  workingPatternService,
} from "#test/support";

test("adds one terms history line per moved person and none for a skipped person", async ({
  orm,
  seed,
}) => {
  const first = await seed.employee({ startDate: "2024-03-01" });
  const second = await seed.employee({ startDate: "2024-03-01" });
  const skipped = await seed.employee({ startDate: "2024-03-01" });
  const england = await seed.defaultTermsId();
  const scotland = await seed.terms("Scotland");
  await seedTermsPeriods(orm, skipped.id, [{ termsId: scotland, startDate: null, endDate: null }]);
  const service = workingPatternService(orm, { today: "2026-11-09" });

  await service.changeTerms(OWNER, {
    employeeIds: [first.id, skipped.id, second.id],
    termsId: scotland,
    startDate: "2026-12-01",
  });

  const history = employeeServices(orm);
  for (const employeeId of [first.id, second.id]) {
    const page = await history.readEmployeeHistory(OWNER, employeeId, {});
    expect(page.edges.map(({ node }) => node)).toMatchObject([
      {
        recordType: "employee",
        recordId: employeeId,
        operation: "UPDATED",
        changes: [
          {
            field: "terms",
            oldValue: JSON.stringify({ termsId: england, startDate: "2026-12-01" }),
            newValue: JSON.stringify({ termsId: scotland, startDate: "2026-12-01" }),
            oldLabel: "England and Wales",
            newLabel: "Scotland",
          },
        ],
      },
    ]);
  }
  expect((await history.readEmployeeHistory(OWNER, skipped.id, {})).edges).toEqual([]);
});

test("publishes one terms change with all moved people and their earliest move date", async ({
  orm,
  seed,
}) => {
  const later = await seed.employee({ startDate: "2027-01-10" });
  const current = await seed.employee({ startDate: "2024-03-01" });
  const termsId = await seed.terms("Scotland");
  const { events, transact } = termsChangedEvents(orm);
  const service = workingPatternService(orm, { today: "2026-11-09", transact });

  await service.changeTerms(OWNER, {
    employeeIds: [later.id, current.id],
    termsId,
    startDate: "2026-12-01",
  });

  expect(events).toEqual([{ employeeIds: [later.id, current.id], from: "2026-12-01" }]);
});

test("publishes no terms change when nobody moves", async ({ orm, seed }) => {
  const employee = await seed.employee({ startDate: "2024-03-01" });
  const termsId = await seed.defaultTermsId();
  const { events, transact } = termsChangedEvents(orm);
  const service = workingPatternService(orm, { today: "2026-11-09", transact });

  await service.changeTerms(OWNER, {
    employeeIds: [employee.id],
    termsId,
    startDate: "2026-12-01",
  });

  expect(events).toEqual([]);
});
