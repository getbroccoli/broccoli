import {
  employeeServices,
  employeeSetup,
  expect,
  OWNER,
  readAllowances,
  readOwnPatternAssignments,
  scotlandTimeOffSetup,
  test,
  timeOffService,
  transactWithTimeOffEvents,
  workingPatternService,
} from "#test/support";

test("a new person starts on terms configured before their location existed", async ({
  orm,
  transact,
}) => {
  const input = scotlandTimeOffSetup();
  input.locationTerms = [{ locationName: "  gLaSgOw  ", bankHolidayCalendar: "scotland" }];
  const result = await transact((tx) => timeOffService(orm).turnOnTimeOff(OWNER, tx, input));
  const employees = employeeServices(orm);

  const { idsByEmail } = await transactWithTimeOffEvents(orm)((tx) =>
    employeeSetup.createImportedEmployees(
      OWNER,
      tx,
      [
        {
          firstName: "Avery",
          lastName: "Stone",
          email: "avery@example.com",
          startDate: "2025-01-01",
          locationName: "Glasgow",
        },
      ],
      { kind: "ADDED_FROM_IMPORT" },
    ),
  );
  const employee = await employees.readEmployee(OWNER, idsByEmail.get("avery@example.com")!);

  const locations = await employees.listLocations(OWNER);
  expect(locations).toHaveLength(1);
  expect(employee).toMatchObject({ locationId: locations[0]!.id });
  const memberships = await transact((tx) => employees.readTermsMemberships(tx, [employee!.id]));
  expect(memberships.get(employee!.id)).toEqual([
    { termsId: result.termsIds[1], startDate: null, endDate: null },
  ]);
  expect(await readAllowances(orm, employee!.id)).toMatchObject([
    { typeKey: "annual_leave", total: 21 },
  ]);
});

test("changing a person's location keeps their terms", async ({ orm, seed, transact }) => {
  const glasgow = await seed.location("Glasgow");
  const leeds = await seed.location("Leeds");
  const input = scotlandTimeOffSetup();
  const result = await transact((tx) => timeOffService(orm).turnOnTimeOff(OWNER, tx, input));
  const employee = await seed.employee({ locationId: glasgow.id });
  const employees = employeeServices(orm);

  const updated = await employees.updateEmployee(OWNER, { id: employee.id, locationId: leeds.id });

  expect(updated.employee).toMatchObject({ locationId: leeds.id });
  const memberships = await transact((tx) => employees.readTermsMemberships(tx, [employee.id]));
  expect(memberships.get(employee.id)).toEqual([
    { termsId: result.termsIds[1], startDate: null, endDate: null },
  ]);
});

test("turning time off on preserves deliberately changed terms memberships", async ({
  orm,
  seed,
  transact,
}) => {
  const glasgow = await seed.location("Glasgow");
  const moved = await seed.employee({ locationId: glasgow.id });
  const datedDefault = await seed.employee({ locationId: glasgow.id });
  const otherTermsId = await seed.terms("Other terms");
  await seed.moveToTerms(moved.id, otherTermsId, "2026-01-01");
  await seed.moveToTerms(datedDefault.id, await seed.defaultTermsId(), "2026-01-01");
  const employees = employeeServices(orm);
  const ids = [moved.id, datedDefault.id];
  const before = await transact((tx) => employees.readTermsMemberships(tx, ids));
  const input = scotlandTimeOffSetup();

  await transact((tx) => timeOffService(orm).turnOnTimeOff(OWNER, tx, input));

  expect(await transact((tx) => employees.readTermsMemberships(tx, ids))).toEqual(before);
});

test("turning time off on preserves existing default memberships and own pattern assignments", async ({
  orm,
  seed,
  transact,
}) => {
  const glasgow = await seed.location("Glasgow");
  const employee = await seed.employee({ locationId: glasgow.id, startDate: "2025-01-01" });
  const patterns = workingPatternService(orm);
  const own = await patterns.createPattern(OWNER, {
    name: "Monday only",
    minutes: [450, 0, 0, 0, 0, 0, 0],
    fullDayMinutes: 450,
  });
  await patterns.assignPattern(OWNER, {
    employeeId: employee.id,
    workingPatternId: own.id,
    startDate: "2025-01-01",
  });
  const before = await readOwnPatternAssignments(orm, [employee.id]);
  const input = scotlandTimeOffSetup();

  await transact((tx) => timeOffService(orm).turnOnTimeOff(OWNER, tx, input));

  const memberships = await transact((tx) =>
    employeeServices(orm).readTermsMemberships(tx, [employee.id]),
  );
  expect(memberships.get(employee.id)).toEqual([
    { termsId: await seed.defaultTermsId(), startDate: null, endDate: null },
  ]);
  expect(await readOwnPatternAssignments(orm, [employee.id])).toEqual(before);
  expect(
    (
      await patterns.readWorkingWeeks(OWNER, {
        employeeIds: [employee.id],
        from: "2026-01-01",
        until: "2026-12-31",
      })
    ).get(employee.id),
  ).toEqual([
    {
      startDate: "2026-01-01",
      minutes: [450, 0, 0, 0, 0, 0, 0],
      fullDayMinutes: 450,
      bankHolidayCalendar: "england_and_wales",
    },
  ]);
});
