import {
  ADMIN,
  EMPLOYEE,
  employeeServices,
  employeeSetup,
  expect,
  OWNER,
  termsService,
  test,
} from "#test/support";

test("stores a trimmed location name with its original case", async ({ orm }) => {
  const locations = employeeServices(orm);

  const location = await locations.createLocation(ADMIN, { name: "  Leeds  " });

  expect(location).toEqual({ id: expect.any(String) as unknown, name: "Leeds" });
  expect(await locations.listLocations(OWNER)).toEqual([
    { ...location, peopleCount: 0, termsId: null },
  ]);
});

test.for([
  { name: "   ", code: "required" },
  { name: "a".repeat(101), code: "too_long" },
])("refuses a new location name with error $code", async ({ name, code }, { orm }) => {
  const locations = employeeServices(orm);

  await expect(locations.createLocation(OWNER, { name })).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "name", code }],
  });

  expect(await locations.listLocations(OWNER)).toEqual([]);
});

test("refuses a name another location has, ignoring case and surrounding spaces", async ({
  orm,
  seed,
}) => {
  const leeds = await seed.location("Leeds");
  const locations = employeeServices(orm);

  await expect(locations.createLocation(OWNER, { name: "  LEEDS  " })).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "name", code: "taken" }],
  });

  expect(await locations.listLocations(OWNER)).toEqual([
    { ...leeds, peopleCount: 0, termsId: null },
  ]);
});

test("renames a location without changing its id", async ({ orm, seed }) => {
  const location = await seed.location("Leeds");
  const locations = employeeServices(orm);

  const renamed = await locations.updateLocation(ADMIN, { id: location.id, name: "  York  " });

  expect(renamed).toEqual({ id: location.id, name: "York" });
  expect(await locations.listLocations(OWNER)).toEqual([
    { ...renamed, peopleCount: 0, termsId: null },
  ]);
});

test("allows a location's own name in another case", async ({ orm, seed }) => {
  const location = await seed.location("leeds");

  expect(
    await employeeServices(orm).updateLocation(OWNER, { id: location.id, name: "Leeds" }),
  ).toEqual({
    id: location.id,
    name: "Leeds",
  });
});

test("refuses renaming a location to another location's name", async ({ orm, seed }) => {
  const leeds = await seed.location("Leeds");
  const york = await seed.location("York");
  const locations = employeeServices(orm);

  await expect(
    locations.updateLocation(OWNER, { id: york.id, name: " leeds " }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "name", code: "taken" }],
  });

  expect(await locations.listLocations(OWNER)).toEqual([
    { ...leeds, peopleCount: 0, termsId: null },
    { ...york, peopleCount: 0, termsId: null },
  ]);
});

test.for(["not-a-uuid", "00000000-0000-4000-8000-000000000001"])(
  "refuses renaming a location with unknown id %s",
  async (id, { orm }) => {
    await expect(
      employeeServices(orm).updateLocation(OWNER, { id, name: "Leeds" }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "No location has this id.",
    });
  },
);

test.for(["not-a-uuid", "00000000-0000-4000-8000-000000000001"])(
  "refuses deleting a location with unknown id %s",
  async (id, { orm }) => {
    await expect(employeeServices(orm).deleteLocation(OWNER, { id })).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "No location has this id.",
    });
  },
);

test("deletes a location nobody is in", async ({ orm, seed }) => {
  const location = await seed.location("Leeds");
  const locations = employeeServices(orm);

  expect(await locations.deleteLocation(ADMIN, { id: location.id })).toEqual({
    deletedLocationId: location.id,
  });

  expect(await locations.listLocations(OWNER)).toEqual([]);
});

test("refuses deleting a location someone is in", async ({ orm, seed }) => {
  const location = await seed.location("Leeds");
  const employee = await seed.employee({ locationId: location.id });
  const locations = employeeServices(orm);

  await expect(locations.deleteLocation(OWNER, { id: location.id })).rejects.toMatchObject({
    code: "CONFLICT",
    message: "Move everyone out of Leeds first.",
  });

  expect(await locations.listLocations(OWNER)).toEqual([
    { ...location, peopleCount: 1, termsId: null },
  ]);
  expect(await locations.readEmployee(OWNER, employee.id)).toEqual(employee);
});

test("lists locations by name ignoring case and counts only their current people", async ({
  orm,
  seed,
}) => {
  const york = await seed.location("York");
  const leeds = await seed.location("leeds");
  await seed.employee({ locationId: leeds.id });
  const moved = await seed.employee({ locationId: leeds.id });
  await seed.employee();
  const locations = employeeServices(orm);
  await locations.updateEmployee(OWNER, { id: moved.id, locationId: york.id });

  expect(await locations.listLocations(OWNER)).toEqual([
    { ...leeds, peopleCount: 1, termsId: null },
    { ...york, peopleCount: 1, termsId: null },
  ]);
});

test.for([
  { profile: "OWNER", ctx: OWNER },
  { profile: "ADMIN", ctx: ADMIN },
  { profile: "EMPLOYEE", ctx: EMPLOYEE },
])("allows an $profile to list location names", async ({ ctx }, { orm, seed }) => {
  const location = await seed.location("Leeds");

  expect(await employeeServices(orm).listLocations(ctx)).toMatchObject([location]);
});

test("refuses an employee creating a location", async ({ orm }) => {
  const locations = employeeServices(orm);

  await expect(locations.createLocation(EMPLOYEE, { name: "Leeds" })).rejects.toMatchObject({
    code: "FORBIDDEN",
  });

  expect(await locations.listLocations(OWNER)).toEqual([]);
});

test("refuses an employee renaming a location", async ({ orm, seed }) => {
  const location = await seed.location("Leeds");
  const locations = employeeServices(orm);

  await expect(
    locations.updateLocation(EMPLOYEE, { id: location.id, name: "York" }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });

  expect(await locations.listLocations(OWNER)).toEqual([
    { ...location, peopleCount: 0, termsId: null },
  ]);
});

test("refuses an employee deleting a location", async ({ orm, seed }) => {
  const location = await seed.location("Leeds");
  const locations = employeeServices(orm);

  await expect(locations.deleteLocation(EMPLOYEE, { id: location.id })).rejects.toMatchObject({
    code: "FORBIDDEN",
  });

  expect(await locations.listLocations(OWNER)).toEqual([
    { ...location, peopleCount: 0, termsId: null },
  ]);
});

test("creates a location whose new people start on the chosen terms", async ({ orm, seed }) => {
  const termsId = await seed.terms("Scotland");
  const locations = employeeServices(orm);

  const location = await locations.createLocation(ADMIN, { name: "Glasgow", termsId });

  expect(await locations.listLocations(ADMIN)).toEqual([{ ...location, peopleCount: 0, termsId }]);
});

test.for([{ name: "Leeds" }, { name: "Leeds", termsId: null }])(
  "creates a location on the default terms with termsId $termsId",
  async (input, { orm }) => {
    const locations = employeeServices(orm);

    const location = await locations.createLocation(ADMIN, input);

    expect(await locations.listLocations(ADMIN)).toEqual([
      { ...location, peopleCount: 0, termsId: null },
    ]);
  },
);

test("changing only a location's terms keeps its name", async ({ orm, seed }) => {
  const location = await seed.location("Glasgow");
  const termsId = await seed.terms("Scotland");
  const locations = employeeServices(orm);

  const updated = await locations.updateLocation(ADMIN, { id: location.id, termsId });

  expect(updated).toEqual(location);
  expect(await locations.listLocations(ADMIN)).toEqual([{ ...location, peopleCount: 0, termsId }]);
});

test("renaming only a location keeps its terms", async ({ orm, seed }) => {
  const termsId = await seed.terms("Scotland");
  const locations = employeeServices(orm);
  const location = await locations.createLocation(ADMIN, { name: "Glasgow", termsId });

  const renamed = await locations.updateLocation(ADMIN, { id: location.id, name: "Glasgow West" });

  expect(renamed).toEqual({ id: location.id, name: "Glasgow West" });
  expect(await locations.listLocations(ADMIN)).toEqual([{ ...renamed, peopleCount: 0, termsId }]);
});

test("clears a location back to the default terms", async ({ orm, seed }) => {
  const termsId = await seed.terms("Scotland");
  const locations = employeeServices(orm);
  const location = await locations.createLocation(ADMIN, { name: "Glasgow", termsId });

  await locations.updateLocation(ADMIN, { id: location.id, termsId: null });

  expect(await locations.listLocations(ADMIN)).toEqual([
    { ...location, peopleCount: 0, termsId: null },
  ]);
});

test("refuses a null location name", async ({ orm, seed }) => {
  const location = await seed.location("Glasgow");
  const locations = employeeServices(orm);

  await expect(
    locations.updateLocation(ADMIN, { id: location.id, name: null }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "name", code: "required" }],
  });

  expect(await locations.listLocations(ADMIN)).toEqual([
    { ...location, peopleCount: 0, termsId: null },
  ]);
});

test.for(["not-a-uuid", "00000000-0000-4000-8000-000000000001"])(
  "refuses creating a location with unknown terms %s without writing it",
  async (termsId, { orm }) => {
    const locations = employeeServices(orm);

    await expect(
      locations.createLocation(ADMIN, { name: "Glasgow", termsId }),
    ).rejects.toMatchObject({
      code: "INVALID_INPUT",
      fieldErrors: [{ field: "termsId", code: "not_found" }],
    });

    expect(await locations.listLocations(ADMIN)).toEqual([]);
  },
);

test.for(["not-a-uuid", "00000000-0000-4000-8000-000000000001"])(
  "refuses updating a location with unknown terms %s without changing it",
  async (termsId, { orm, seed }) => {
    const originalTermsId = await seed.terms("Scotland");
    const locations = employeeServices(orm);
    const location = await locations.createLocation(ADMIN, {
      name: "Glasgow",
      termsId: originalTermsId,
    });

    await expect(
      locations.updateLocation(ADMIN, { id: location.id, name: "Glasgow West", termsId }),
    ).rejects.toMatchObject({
      code: "INVALID_INPUT",
      fieldErrors: [{ field: "termsId", code: "not_found" }],
    });

    expect(await locations.listLocations(ADMIN)).toEqual([
      { ...location, peopleCount: 0, termsId: originalTermsId },
    ]);
  },
);

test("a location's changed terms apply to new people and leave its existing people on their terms", async ({
  orm,
  seed,
  transact,
}) => {
  const defaultId = await seed.defaultTermsId();
  const scotland = await seed.terms("Scotland");
  const location = await seed.location("Glasgow");
  await transact((tx) =>
    employeeSetup.createImportedEmployees(
      ADMIN,
      tx,
      [
        {
          firstName: "Avery",
          lastName: "Stone",
          email: "avery@example.com",
          locationName: "Glasgow",
        },
      ],
      { kind: "ADDED_FROM_IMPORT" },
    ),
  );

  await employeeServices(orm).updateLocation(ADMIN, { id: location.id, termsId: scotland });
  await transact((tx) =>
    employeeSetup.createImportedEmployees(
      ADMIN,
      tx,
      [
        {
          firstName: "Robin",
          lastName: "Reed",
          email: "robin@example.com",
          locationName: "Glasgow",
        },
      ],
      { kind: "ADDED_FROM_IMPORT" },
    ),
  );

  const terms = await termsService(orm, { today: "2026-11-06" }).listTerms(ADMIN);
  expect(terms.map(({ id, peopleCount }) => ({ id, peopleCount }))).toEqual([
    { id: defaultId, peopleCount: 1 },
    { id: scotland, peopleCount: 1 },
  ]);
});
