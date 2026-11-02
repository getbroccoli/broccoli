import {
  employeeServices,
  importServices,
  SETUP_HOLDER,
  expectHistoryReplaysTo,
  expect,
  EMPLOYEE,
  OWNER,
  PNG,
  storedFileIds,
  test,
  employeeSetup,
} from "#test/support";

test("refuses an employee creating demo employees without storing employees or avatars", async ({
  orm,
  transact,
}) => {
  const { listEmployees } = employeeServices(orm);

  await expect(
    transact((tx) =>
      employeeSetup.createDemoEmployees(
        EMPLOYEE,
        tx,
        [
          {
            employee: { firstName: "Demo", lastName: "Employee", email: "demo@example.com" },
            avatar: { bytes: PNG, mimeType: "image/png" },
          },
        ],
        { kind: "ADDED_WITH_DEMO" },
      ),
    ),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });

  expect((await listEmployees(OWNER, { first: 100 })).edges).toEqual([]);
  expect(await storedFileIds(orm)).toEqual([]);
});

test("refuses an employee checking whether demo employees exist", async ({ orm }) => {
  await expect(async () => employeeSetup.hasDemoEmployees(EMPLOYEE, orm)).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
});

test("creates no demo employees when employees exist", async ({ orm, seed, transact }) => {
  const employee = await seed.employee();

  await transact((tx) =>
    employeeSetup.createDemoEmployees(
      OWNER,
      tx,
      [
        {
          employee: { firstName: "Demo", lastName: "Employee", email: "demo@example.com" },
          avatar: { bytes: PNG, mimeType: "image/png" },
        },
      ],
      { kind: "ADDED_WITH_DEMO" },
    ),
  );

  const { edges } = await employeeServices(orm).listEmployees(OWNER, {});
  expect(edges.map(({ node }) => node)).toEqual([employee]);
  expect(await storedFileIds(orm)).toEqual([]);
});

test("records a creation line for each demo employee with the supplied cause", async ({
  orm,
  transact,
}) => {
  const demoEmployees = [
    {
      employee: {
        firstName: "Avery",
        lastName: "Stone",
        email: "avery@example.com",
        startDate: "2026-02-28",
      },
      locationName: "Leeds",
      avatar: { bytes: PNG, mimeType: "image/png" as const },
    },
    {
      employee: {
        firstName: "Robin",
        lastName: "Reed",
        email: "robin@example.com",
        jobTitle: "Engineer",
      },
      avatar: { bytes: PNG, mimeType: "image/png" as const },
    },
  ];

  await transact((tx) =>
    employeeSetup.createDemoEmployees(OWNER, tx, demoEmployees, { kind: "ADDED_WITH_DEMO" }),
  );

  const employees = employeeServices(orm);
  const { edges } = await employees.listEmployees(OWNER, {});
  expect(edges).toHaveLength(2);
  for (const { node: employee } of edges) {
    const history = await employees.readEmployeeHistory(OWNER, employee.id, {});
    expect(history.edges).toHaveLength(1);
    expect(history.edges[0]!.node).toMatchObject({
      operation: "CREATED",
      cause: { kind: "ADDED_WITH_DEMO", ref: null },
      author: { kind: "SIGNED_IN_USER", id: OWNER.user!.userId },
    });
    if (employee.email === "avery@example.com") {
      expect(employee.locationId).not.toBeNull();
      expect(history.edges[0]!.node.changes).toContainEqual({
        field: "location",
        oldValue: null,
        newValue: employee.locationId,
        oldLabel: null,
        newLabel: "Leeds",
      });
    }
    await expectHistoryReplaysTo(orm, employee.id);
  }
});

test("fills the demo company with locations that have people", async ({ orm, seed }) => {
  await seed.setupStep("import");

  await importServices(orm).startDemo(SETUP_HOLDER);

  const locations = await employeeServices(orm).listLocations(OWNER);
  expect(locations.length).toBeGreaterThan(0);
  for (const location of locations) {
    expect(location.peopleCount).toBeGreaterThan(0);
  }
});
