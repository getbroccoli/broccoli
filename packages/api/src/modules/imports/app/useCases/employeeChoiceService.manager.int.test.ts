import { expect, importUseCases, OWNER, test } from "#test/support";

test("chooses one manager for several import employees", async ({ orm, seed }) => {
  const source = await seed.importSource();
  await seed.importEmployees(source.id, [
    { email: "avery@example.com" },
    { email: "robin@example.com" },
    { email: "taylor@example.com" },
  ]);
  const imports = importUseCases(orm);

  await imports.choices.chooseManager(OWNER, {
    keys: ["avery@example.com", "robin@example.com"],
    managerKey: "taylor@example.com",
  });

  const review = await importUseCases(orm).reads.readReview(OWNER);
  expect(review.managers.get("avery@example.com")?.manager?.key).toBe("taylor@example.com");
  expect(review.managers.get("robin@example.com")?.manager?.key).toBe("taylor@example.com");
});

test("skips the chosen manager among selected import employees", async ({ orm, seed }) => {
  const source = await seed.importSource();
  await seed.importEmployees(source.id, [
    { email: "avery@example.com" },
    { email: "robin@example.com" },
  ]);
  const imports = importUseCases(orm);

  await imports.choices.chooseManager(OWNER, {
    keys: ["avery@example.com", "robin@example.com"],
    managerKey: "robin@example.com",
  });

  const review = await imports.reads.readReview(OWNER);
  expect(review.managers.get("avery@example.com")?.manager?.key).toBe("robin@example.com");
  expect(review.managers.get("robin@example.com")).toEqual({ manager: null, problem: null });
  expect(
    review.listEmployees({}).edges.find(({ node }) => node.key === "robin@example.com")?.node
      .chosenManager,
  ).toBeNull();
});

test("chooses no manager even when the source names one", async ({ orm, seed }) => {
  const source = await seed.importSource();
  await seed.importEmployees(source.id, [
    { email: "avery@example.com", manager: "Missing Person" },
  ]);
  const imports = importUseCases(orm);

  await imports.choices.chooseManager(OWNER, { keys: ["avery@example.com"], managerKey: null });

  const review = await importUseCases(orm).reads.readReview(OWNER);
  expect(review.managers.get("avery@example.com")).toEqual({ manager: null, problem: null });
  expect(review.listEmployees({}).edges[0]!.node.chosenManager).toEqual({ noManager: true });
});

test("refuses choosing a manager for an unknown import employee", async ({ orm, seed }) => {
  const source = await seed.importSource();
  await seed.importEmployees(source.id, [{ email: "robin@example.com" }]);

  await expect(
    importUseCases(orm).choices.chooseManager(OWNER, {
      keys: ["missing@example.com"],
      managerKey: "robin@example.com",
    }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "employeeId", code: "not_found" }],
  });
});

test("refuses choosing an unknown import manager", async ({ orm, seed }) => {
  const source = await seed.importSource();
  await seed.importEmployees(source.id, [{ email: "avery@example.com" }]);

  await expect(
    importUseCases(orm).choices.chooseManager(OWNER, {
      keys: ["avery@example.com"],
      managerKey: "missing@example.com",
    }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "managerId", code: "not_found" }],
  });
});

test("picking a record's manager reference clears the chosen person", async ({ orm, seed }) => {
  const source = await seed.importSource();
  const records = await seed.importEmployees(source.id, [
    { email: "avery@example.com", manager: "robin@example.com" },
    { email: "robin@example.com" },
    { email: "taylor@example.com" },
  ]);
  const imports = importUseCases(orm);
  await imports.choices.chooseManager(OWNER, {
    keys: ["avery@example.com"],
    managerKey: "taylor@example.com",
  });

  await imports.choices.chooseEmployeeValue(OWNER, {
    key: "avery@example.com",
    field: "manager",
    choice: { recordId: records.find(({ email }) => email === "avery@example.com")!.id },
  });

  const review = await imports.reads.readReview(OWNER);
  const employee = review
    .listEmployees({})
    .edges.find(({ node }) => node.key === "avery@example.com")!.node;
  expect(employee.chosenManager).toBeNull();
  expect(employee.values.manager).toMatchObject({ value: "robin@example.com", choice: "picked" });
  expect(review.managers.get(employee.key)?.manager?.key).toBe("robin@example.com");
});

test("refuses a typed manager reference", async ({ orm, seed }) => {
  const source = await seed.importSource();
  await seed.importEmployees(source.id, [{ email: "avery@example.com" }]);

  await expect(
    importUseCases(orm).choices.chooseEmployeeValue(OWNER, {
      key: "avery@example.com",
      field: "manager",
      choice: { value: "Robin Reed" },
    }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "value", code: "invalid" }],
  });
});
