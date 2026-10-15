import { expect, importUseCases, NON_OWNER, OWNER, test } from "#test/support";

import { instanceRepository, readSetupStep } from "../../../../core/instance";
import { createEmployeeUseCases } from "../../../employees";

test("approving creates an employee per complete record and completes setup", async ({
  orm,
  seed,
}) => {
  const owner = await seed.owner();
  await instanceRepository(orm).setOwner(owner.user!.userId, "import");
  const source = await seed.importSource();
  const avery = {
    firstName: "Avery",
    lastName: "Stone",
    email: "avery@example.com",
    jobTitle: "Designer",
  };
  const robin = { firstName: "Robin", lastName: "Reed", email: "robin@example.com" };
  await seed.importEmployees(source.id, [avery, robin]);
  const imports = importUseCases(orm);

  await imports.approveImport(owner);

  expect(await readSetupStep(orm)).toBe("done");
  const employees = await createEmployeeUseCases({ orm }).listEmployees(OWNER, { first: 100 });
  expect(employees.edges.map(({ node }) => node)).toEqual(
    expect.arrayContaining([expect.objectContaining(avery), expect.objectContaining(robin)]),
  );
  expect(employees.edges).toHaveLength(2);
});

test("approving leaves a record without a last name in the import without creating it", async ({
  orm,
  seed,
}) => {
  const owner = await seed.owner();
  await instanceRepository(orm).setOwner(owner.user!.userId, "import");
  const source = await seed.importSource();
  const records = await seed.importEmployees(source.id, [
    { firstName: "Avery", lastName: null, email: "avery@example.com" },
  ]);
  const imports = importUseCases(orm);

  await imports.approveImport(owner);

  expect(
    (await createEmployeeUseCases({ orm }).listEmployees(OWNER, { first: 100 })).edges,
  ).toEqual([]);
  expect((await imports.listEmployees(OWNER, {})).edges.map(({ node }) => node)).toEqual(records);
});

test("approving twice creates the employees once", async ({ orm, seed }) => {
  const owner = await seed.owner();
  await instanceRepository(orm).setOwner(owner.user!.userId, "import");
  const source = await seed.importSource();
  await seed.importEmployees(source.id, [{}]);
  const imports = importUseCases(orm);
  const employees = createEmployeeUseCases({ orm });
  await imports.approveImport(owner);
  const first = await employees.listEmployees(OWNER, { first: 100 });
  expect(first.edges).toHaveLength(1);

  await imports.approveImport(owner);

  expect(await employees.listEmployees(OWNER, { first: 100 })).toEqual(first);
});

test("two concurrent approves create the employees once", async ({ orm, seed }) => {
  const owner = await seed.owner();
  await instanceRepository(orm).setOwner(owner.user!.userId, "import");
  const source = await seed.importSource();
  const [record] = await seed.importEmployees(source.id, [{}]);
  const imports = importUseCases(orm);

  await Promise.all([imports.approveImport(owner), imports.approveImport(owner)]);

  expect(await readSetupStep(orm)).toBe("done");
  const employees = await createEmployeeUseCases({ orm }).listEmployees(OWNER, { first: 100 });
  expect(employees.edges.map(({ node }) => node.email)).toEqual([record!.email]);
});

test.for(["skipped", "company"] as const)(
  "approving at the %s step creates nothing and leaves setup unchanged",
  async (step, { orm, seed }) => {
    const owner = await seed.owner();
    await instanceRepository(orm).setOwner(
      owner.user!.userId,
      step === "skipped" ? "import" : "company",
    );
    const source = await seed.importSource();
    await seed.importEmployees(source.id, [{}]);
    const imports = importUseCases(orm);
    if (step === "skipped") await imports.skipImport(owner);

    await imports.approveImport(owner);

    expect(await readSetupStep(orm)).toBe(step === "skipped" ? "done" : "company");
    expect(
      (await createEmployeeUseCases({ orm }).listEmployees(OWNER, { first: 100 })).edges,
    ).toEqual([]);
  },
);

test("refuses a non-owner approving the import", async ({ orm, seed }) => {
  const owner = await seed.owner();
  await instanceRepository(orm).setOwner(owner.user!.userId, "import");
  const source = await seed.importSource();
  await seed.importEmployees(source.id, [{}]);
  const imports = importUseCases(orm);

  await expect(imports.approveImport(NON_OWNER)).rejects.toMatchObject({ code: "FORBIDDEN" });

  expect(await readSetupStep(orm)).toBe("import");
  expect(
    (await createEmployeeUseCases({ orm }).listEmployees(OWNER, { first: 100 })).edges,
  ).toEqual([]);
});

test("refuses approval while a file is mapping without advancing setup", async ({ orm, seed }) => {
  const owner = await seed.owner();
  await instanceRepository(orm).setOwner(owner.user!.userId, "import");
  const source = await seed.importSource();
  const records = await seed.importEmployees(source.id, [
    { firstName: "Avery", lastName: "Stone" },
  ]);
  await seed.fileSource({ content: "Name\nRobin Reed" });
  const imports = importUseCases(orm);

  await expect(imports.approveImport(owner)).rejects.toMatchObject({
    code: "CONFLICT",
    message: "Files are still being read.",
  });

  expect(await readSetupStep(orm)).toBe("import");
  expect((await createEmployeeUseCases({ orm }).listEmployees(OWNER, {})).edges).toEqual([]);
  expect((await imports.listEmployees(OWNER, {})).edges.map(({ node }) => node)).toEqual(records);
});

test("approves available records when a failed file is present", async ({ orm, seed }) => {
  const owner = await seed.owner();
  await instanceRepository(orm).setOwner(owner.user!.userId, "import");
  const source = await seed.importSource();
  await seed.importEmployees(source.id, [
    { firstName: "Avery", lastName: "Stone", email: "avery@example.com" },
  ]);
  await seed.fileSource({ content: "Name\nRobin Reed", status: "failed", failure: "unavailable" });
  const imports = importUseCases(orm);

  await imports.approveImport(owner);

  expect(await readSetupStep(orm)).toBe("done");
  expect(
    (await createEmployeeUseCases({ orm }).listEmployees(OWNER, {})).edges.map(({ node }) => node),
  ).toMatchObject([{ firstName: "Avery", lastName: "Stone", email: "avery@example.com" }]);
});
