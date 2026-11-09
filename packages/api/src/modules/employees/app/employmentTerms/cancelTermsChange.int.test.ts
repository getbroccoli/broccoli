import {
  employeeServices,
  expect,
  OWNER,
  seedTermsPeriods,
  termsChangedEvents,
  test,
  workingPatternService,
} from "#test/support";

test("cancels a scheduled move with history and its affected date", async ({ orm, seed }) => {
  const employee = await seed.employee({ startDate: "2024-03-01" });
  const england = await seed.defaultTermsId();
  const scotland = await seed.terms("Scotland");
  await seedTermsPeriods(orm, employee.id, [
    { termsId: england, startDate: "2024-03-01", endDate: "2026-11-30" },
    { termsId: scotland, startDate: "2026-12-01", endDate: null },
  ]);
  const { events, transact } = termsChangedEvents(orm);
  const service = workingPatternService(orm, { today: "2026-11-09", transact });

  await service.cancelTermsChange(OWNER, { employeeId: employee.id, startDate: "2026-12-01" });

  const terms = await service.readEmploymentTerms(OWNER, { employeeIds: [employee.id] });
  expect(terms.get(employee.id)?.periods).toEqual([
    { termsId: england, termsName: "England and Wales", startDate: "2024-03-01", endDate: null },
  ]);
  const history = await employeeServices(orm).readEmployeeHistory(OWNER, employee.id, {});
  expect(history.edges.map(({ node }) => node)).toMatchObject([
    {
      recordType: "employee",
      recordId: employee.id,
      operation: "UPDATED",
      changes: [
        {
          field: "terms",
          oldValue: JSON.stringify({ termsId: scotland, startDate: "2026-12-01" }),
          newValue: null,
          oldLabel: "Scotland",
          newLabel: null,
        },
      ],
    },
  ]);
  expect(events).toEqual([{ employeeIds: [employee.id], from: "2026-12-01" }]);
});

test.for([
  { when: "already started", date: "2026-11-01" },
  { when: "does not exist", date: "2026-12-01" },
])("refuses to cancel a move that $when", async ({ date }, { orm, seed }) => {
  const employee = await seed.employee({ startDate: "2024-03-01" });
  const scotland = await seed.terms("Scotland");
  await seedTermsPeriods(orm, employee.id, [
    { termsId: await seed.defaultTermsId(), startDate: null, endDate: "2026-10-31" },
    { termsId: scotland, startDate: "2026-11-01", endDate: null },
  ]);
  const service = workingPatternService(orm, { today: "2026-11-09" });

  await expect(
    service.cancelTermsChange(OWNER, { employeeId: employee.id, startDate: date }),
  ).rejects.toMatchObject({ code: "CONFLICT", message: "This change has already started." });
});
