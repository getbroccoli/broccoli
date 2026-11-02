import {
  employeeServices,
  employeeSetup,
  expect,
  expectHistoryReplaysTo,
  OWNER,
  test,
} from "#test/support";

test("imports one location for names differing only in case and spaces, keeping the first spelling", async ({
  orm,
  transact,
}) => {
  await transact((tx) =>
    employeeSetup.createImportedEmployees(
      OWNER,
      tx,
      [
        {
          firstName: "Avery",
          lastName: "Stone",
          email: "avery@example.com",
          locationName: " Leeds ",
        },
        {
          firstName: "Robin",
          lastName: "Reed",
          email: "robin@example.com",
          locationName: "leeds ",
        },
        { firstName: "Sam", lastName: "Vale", email: "sam@example.com", locationName: "York" },
      ],
      { kind: "ADDED_FROM_IMPORT" },
    ),
  );

  const employees = employeeServices(orm);
  const locations = await employees.listLocations(OWNER);
  expect(locations).toEqual([
    { id: expect.any(String) as unknown, name: "Leeds", peopleCount: 2 },
    { id: expect.any(String) as unknown, name: "York", peopleCount: 1 },
  ]);
  const { edges } = await employees.listEmployees(OWNER, {});
  expect(edges.map(({ node }) => ({ email: node.email, locationId: node.locationId }))).toEqual(
    expect.arrayContaining([
      { email: "avery@example.com", locationId: locations[0]!.id },
      { email: "robin@example.com", locationId: locations[0]!.id },
      { email: "sam@example.com", locationId: locations[1]!.id },
    ]),
  );
  expect(edges).toHaveLength(3);
});

test("matches an existing location ignoring case and spaces", async ({ orm, seed, transact }) => {
  const location = await seed.location("Leeds");

  const { idsByEmail } = await transact((tx) =>
    employeeSetup.createImportedEmployees(
      OWNER,
      tx,
      [
        {
          firstName: "Avery",
          lastName: "Stone",
          email: "avery@example.com",
          locationName: " LEEDS ",
        },
      ],
      { kind: "ADDED_FROM_IMPORT" },
    ),
  );

  const employees = employeeServices(orm);
  expect(await employees.listLocations(OWNER)).toEqual([{ ...location, peopleCount: 1 }]);
  expect(await employees.readEmployee(OWNER, idsByEmail.get("avery@example.com")!)).toMatchObject({
    locationId: location.id,
  });
});

test("creates no location for an incomplete imported person", async ({ orm, transact }) => {
  const result = await transact((tx) =>
    employeeSetup.createImportedEmployees(
      OWNER,
      tx,
      [{ firstName: "Avery", lastName: "", email: "avery@example.com", locationName: "Leeds" }],
      { kind: "ADDED_FROM_IMPORT" },
    ),
  );

  expect(result).toMatchObject({ created: 0, incomplete: 1 });
  expect(await employeeServices(orm).listLocations(OWNER)).toEqual([]);
});

test.for([undefined, null, "   "])(
  "imports a person without a location for %s",
  async (locationName, { orm, transact }) => {
    const { idsByEmail } = await transact((tx) =>
      employeeSetup.createImportedEmployees(
        OWNER,
        tx,
        [{ firstName: "Avery", lastName: "Stone", email: "avery@example.com", locationName }],
        { kind: "ADDED_FROM_IMPORT" },
      ),
    );

    const employees = employeeServices(orm);
    expect(await employees.listLocations(OWNER)).toEqual([]);
    expect(await employees.readEmployee(OWNER, idsByEmail.get("avery@example.com")!)).toMatchObject(
      { locationId: null },
    );
  },
);

test("records the initial location's id and name on the imported person's creation line", async ({
  orm,
  transact,
}) => {
  const { idsByEmail } = await transact((tx) =>
    employeeSetup.createImportedEmployees(
      OWNER,
      tx,
      [
        {
          firstName: "Avery",
          lastName: "Stone",
          email: "avery@example.com",
          locationName: " Leeds ",
        },
      ],
      { kind: "ADDED_FROM_IMPORT" },
    ),
  );

  const employees = employeeServices(orm);
  const employeeId = idsByEmail.get("avery@example.com")!;
  const [location] = await employees.listLocations(OWNER);
  const { edges } = await employees.readEmployeeHistory(OWNER, employeeId, {});
  expect(edges).toHaveLength(1);
  expect(edges[0]!.node).toMatchObject({ operation: "CREATED" });
  expect(edges[0]!.node.changes).toContainEqual({
    field: "location",
    oldValue: null,
    newValue: location!.id,
    oldLabel: null,
    newLabel: "Leeds",
  });
  await expectHistoryReplaysTo(orm, employeeId);
});
