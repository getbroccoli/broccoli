import {
  ADMIN,
  employeeInviteService,
  employeeServices,
  expect,
  importServices,
  EMPLOYEE,
  PNG,
  SLACK_PHOTO_URL,
  storedFileIds,
  systemService,
  test,
  instances,
  type TestSeed,
} from "#test/support";

import type { Orm } from "../../../core/db";
import { NO_SETUP_INVITES } from "../../../core/instance";

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

  await systemService(orm).completeSetup(owner, NO_INVITES);

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

  await expect(systemService(orm).completeSetup(owner, NO_INVITES)).rejects.toMatchObject({
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

  await systemService(orm).completeSetup(owner, NO_INVITES);

  expect(
    (await employees.listEmployees(owner, { orderBy: { field: "EMAIL" } })).edges.map(
      ({ node }) => node,
    ),
  ).toEqual([existing, expect.objectContaining({ email: "robin@example.com" })]);
});

test("refuses an employee completing setup and keeps the ready step", async ({ orm, seed }) => {
  await seed.owner();
  await seed.setupStep("ready");

  await expect(systemService(orm).completeSetup(EMPLOYEE, NO_INVITES)).rejects.toMatchObject({
    code: "FORBIDDEN",
  });

  expect((await instances.readInstance(orm)).step).toBe("ready");
});

test("invites only the managers when admins and managers are chosen", async ({ orm, seed }) => {
  const owner = await prepareManagedSetup(orm, seed);

  const invites = await systemService(orm).completeSetup(owner, {
    ...NO_INVITES,
    ownerEmployeeKey: "avery@example.com",
    inviteAudience: "admins_and_managers",
  });

  const { edges } = await employeeServices(orm).listEmployees(owner, {});
  const robin = edges.find(({ node }) => node.email === "robin@example.com")!.node;
  expect(invites.map(({ employeeId }) => employeeId)).toEqual([robin.id]);
});

test("creates no invites when only admins are chosen", async ({ orm, seed }) => {
  const owner = await prepareManagedSetup(orm, seed);
  const setup = systemService(orm);

  const invites = await setup.completeSetup(owner, NO_INVITES);

  expect(invites).toEqual([]);
  expect(setup.sentJobs).toEqual([]);
  const { edges } = await employeeServices(orm).listEmployees(owner, {});
  const statuses = await employeeInviteService(orm).readStatuses(
    owner,
    edges.map(({ node }) => node.id),
  );
  expect([...statuses.values()].map(({ state }) => state)).toEqual([
    "not_invited",
    "not_invited",
    "not_invited",
  ]);
});

test("invites everyone added except the owner's person when everyone is chosen", async ({
  orm,
  seed,
}) => {
  const owner = await prepareManagedSetup(orm, seed);

  const invites = await systemService(orm).completeSetup(owner, {
    ...NO_INVITES,
    ownerEmployeeKey: "avery@example.com",
    inviteAudience: "everyone",
  });

  const { edges } = await employeeServices(orm).listEmployees(owner, {});
  expect(invites.map(({ employeeId }) => employeeId).sort()).toEqual(
    edges
      .filter(({ node }) => node.email !== "avery@example.com")
      .map(({ node }) => node.id)
      .sort(),
  );
  expect(invites).toHaveLength(2);
});

test("links the owner to their chosen person even when their work email differs", async ({
  orm,
  seed,
}) => {
  const owner = await prepareManagedSetup(orm, seed);

  await systemService(orm).completeSetup(owner, {
    ...NO_INVITES,
    ownerEmployeeKey: "avery@example.com",
  });

  const { edges } = await employeeServices(orm).listEmployees(owner, {});
  const avery = edges.find(({ node }) => node.email === "avery@example.com")!.node;
  expect(avery.userId).toBe(owner.user!.userId);
  expect(
    (await employeeInviteService(orm).readStatuses(owner, [avery.id])).get(avery.id),
  ).toMatchObject({ state: "joined" });
});

test("finishes without linking anyone when the chosen person is absent", async ({ orm, seed }) => {
  const owner = await prepareManagedSetup(orm, seed);

  await systemService(orm).completeSetup(owner, {
    ...NO_INVITES,
    ownerEmployeeKey: "absent@example.com",
  });

  expect((await instances.readInstance(orm)).step).toBe("done");
  const { edges } = await employeeServices(orm).listEmployees(owner, {});
  expect(edges.map(({ node }) => node.userId)).toEqual([null, null, null]);
});

test("refuses deleting the person linked to the owner at setup", async ({ orm, seed }) => {
  const owner = await prepareManagedSetup(orm, seed);
  await systemService(orm).completeSetup(owner, {
    ...NO_INVITES,
    ownerEmployeeKey: "avery@example.com",
  });
  const employees = employeeServices(orm);
  const { edges } = await employees.listEmployees(owner, {});
  const avery = edges.find(({ node }) => node.email === "avery@example.com")!.node;

  await expect(employees.deleteEmployee(owner, { id: avery.id })).rejects.toMatchObject({
    code: "FORBIDDEN",
    message: "The owner cannot be deleted.",
  });

  expect(await employees.readEmployee(owner, avery.id)).toEqual(avery);
});

test("refuses a note with a link on the relay without adding people or queuing invites", async ({
  orm,
  seed,
}) => {
  const owner = await prepareManagedSetup(orm, seed);
  const setup = systemService(orm, { mode: "managed" });

  await expect(
    setup.completeSetup(owner, {
      ...NO_INVITES,
      inviteAudience: "everyone",
      inviteNote: "Read https://example.com/welcome",
    }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "note", code: "has_link" }],
  });

  expect((await instances.readInstance(orm)).step).toBe("ready");
  expect((await employeeServices(orm).listEmployees(owner, {})).edges).toEqual([]);
  expect(setup.sentJobs).toEqual([]);
});

test("queues one email job per invite and returns no links when email is chosen", async ({
  orm,
  seed,
}) => {
  const owner = await prepareManagedSetup(orm, seed);
  await seed.mailSettings();
  const setup = systemService(orm);

  const invites = await setup.completeSetup(owner, {
    ...NO_INVITES,
    ownerEmployeeKey: "avery@example.com",
    inviteAudience: "everyone",
  });

  expect(invites.map(({ link }) => link)).toEqual([null, null]);
  expect(setup.sentJobs.map(({ name }) => name)).toEqual([
    "employees.sendInvite",
    "employees.sendInvite",
  ]);
  expect(new Set(setup.sentJobs.map(({ payload }) => payload.inviteId)).size).toBe(2);
});

test("returns one link per invite without queuing email when no email is chosen", async ({
  orm,
  seed,
}) => {
  const owner = await prepareManagedSetup(orm, seed);
  const setup = systemService(orm);

  const invites = await setup.completeSetup(owner, {
    ...NO_INVITES,
    ownerEmployeeKey: "avery@example.com",
    inviteAudience: "everyone",
  });

  expect(invites).toHaveLength(2);
  for (const invite of invites) {
    expect(invite.link).toMatch(/^https:\/\/broccoli\.example\.com\/invite#[A-Za-z0-9_-]{43}$/);
  }
  expect(new Set(invites.map(({ link }) => link)).size).toBe(2);
  expect(setup.sentJobs).toEqual([]);
});

test("links the owner's user even when an admin finishes setup", async ({ orm, seed }) => {
  const owner = await prepareManagedSetup(orm, seed);

  await systemService(orm).completeSetup(ADMIN, {
    ...NO_INVITES,
    ownerEmployeeKey: "avery@example.com",
  });

  const { edges } = await employeeServices(orm).listEmployees(owner, {});
  const avery = edges.find(({ node }) => node.email === "avery@example.com")!.node;
  expect(avery.userId).toBe(owner.user!.userId);
});

test("does not invite the person with the owner's sign-in email", async ({ orm, seed }) => {
  await seed.assignment();
  const owner = await seed.owner();
  await seed.setupStep("import");
  const source = await seed.importSource();
  await seed.importEmployees(source.id, [
    { email: owner.user!.email },
    { email: "robin@example.com" },
  ]);
  const imports = importServices(orm);
  await imports.approveImport(owner, (await imports.reads.readReview(owner)).version);

  const invites = await systemService(orm).completeSetup(owner, {
    ...NO_INVITES,
    inviteAudience: "everyone",
  });

  const { edges } = await employeeServices(orm).listEmployees(owner, {});
  const robin = edges.find(({ node }) => node.email === "robin@example.com")!.node;
  expect(invites).toHaveLength(1);
  expect(invites[0]!.employeeId).toBe(robin.id);
});

async function prepareManagedSetup(orm: Orm, seed: TestSeed) {
  await seed.assignment({ instanceCredential: "test-instance-credential" });
  const owner = await seed.owner();
  await seed.setupStep("import");
  const source = await seed.importSource();
  await seed.importEmployees(source.id, [
    { email: "avery@example.com" },
    { email: "robin@example.com", manager: "avery@example.com" },
    { email: "taylor@example.com", manager: "robin@example.com" },
  ]);
  const imports = importServices(orm);
  await imports.approveImport(owner, (await imports.reads.readReview(owner)).version);
  return owner;
}

const NO_INVITES = { ...NO_SETUP_INVITES, linkOrigin: "https://broccoli.example.com" };
