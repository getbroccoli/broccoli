import {
  employeeServices,
  expect,
  importServices,
  EMPLOYEE,
  PNG,
  SLACK_PHOTO_URL,
  storedFileIds,
  systemService,
  test,
} from "#test/support";

import { createInstanceService } from "../../../core/instance";

const instances = createInstanceService();

test("finishing managed setup creates exactly the ready people with their avatars", async ({
  orm,
  seed,
}) => {
  await seed.assignment();
  const owner = await seed.owner();
  await seed.setupStep("import");
  const source = await seed.importSource();
  const records = await seed.importEmployees(source.id, [
    { email: "avery@example.com", photoUrl: SLACK_PHOTO_URL },
    { email: "leftout@example.com", photoUrl: SLACK_PHOTO_URL },
    { email: "incomplete@example.com", lastName: null },
  ]);
  const avatar = await seed.importPhoto(records[0]!.id, {
    photoUrl: SLACK_PHOTO_URL,
    content: PNG,
    mimeType: "image/png",
  });
  await seed.importPhoto(records[1]!.id, {
    photoUrl: SLACK_PHOTO_URL,
    content: PNG,
    mimeType: "image/png",
  });
  const imports = importServices(orm);
  await imports.choices.setLeftOut(owner, { key: "leftout@example.com", leftOut: true });
  await imports.approveImport(owner, (await imports.reads.readReview(owner)).version);
  expect(await storedFileIds(orm)).toHaveLength(2);

  await systemService(orm).completeSetup(owner);

  expect((await instances.readInstance(orm)).step).toBe("done");
  expect((await employeeServices(orm).listEmployees(owner, {})).edges).toMatchObject([
    { node: { email: "avery@example.com", avatarFileId: avatar } },
  ]);
});

test("refuses finishing after another tab goes Back and creates nobody", async ({ orm, seed }) => {
  await seed.assignment();
  const owner = await seed.owner();
  await seed.setupStep("import");
  const source = await seed.importSource();
  await seed.importEmployees(source.id, [{}]);
  const imports = importServices(orm);
  await imports.approveImport(owner, (await imports.reads.readReview(owner)).version);
  await imports.reopenReview(owner);

  await expect(systemService(orm).completeSetup(owner)).rejects.toMatchObject({
    code: "CONFLICT",
    message: "Setup is not at the ready step.",
  });

  expect((await instances.readInstance(orm)).step).toBe("import");
  expect((await employeeServices(orm).listEmployees(owner, {})).edges).toEqual([]);
});

test("finishing preserves an employee added by hand after approval and skips their import email", async ({
  orm,
  seed,
}) => {
  await seed.assignment();
  const owner = await seed.owner();
  await seed.setupStep("import");
  const source = await seed.importSource();
  await seed.importEmployees(source.id, [
    { email: "avery@example.com" },
    { email: "robin@example.com" },
  ]);
  const imports = importServices(orm);
  await imports.approveImport(owner, (await imports.reads.readReview(owner)).version);
  const employees = employeeServices(orm);
  const existing = await employees.createEmployee(owner, {
    firstName: "Avery",
    lastName: "Stone",
    email: "avery@example.com",
  });

  await systemService(orm).completeSetup(owner);

  expect(
    (await employees.listEmployees(owner, { orderBy: { field: "EMAIL" } })).edges.map(
      ({ node }) => node,
    ),
  ).toEqual([existing, expect.objectContaining({ email: "robin@example.com" })]);
});

test("refuses an employee completing setup and keeps the ready step", async ({ orm, seed }) => {
  await seed.owner();
  await seed.setupStep("ready");

  await expect(systemService(orm).completeSetup(EMPLOYEE)).rejects.toMatchObject({
    code: "FORBIDDEN",
  });

  expect((await instances.readInstance(orm)).step).toBe("ready");
});
