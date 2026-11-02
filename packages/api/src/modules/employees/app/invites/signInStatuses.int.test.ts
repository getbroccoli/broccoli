import { onTestFinished, vi } from "vitest";
import { employeeInviteService, employeeServices, expect, test } from "#test/support";

test("identifies the workspace owner by email without linking their employee", async ({
  orm,
  seed,
}) => {
  const owner = await seed.owner();
  const employee = await seed.employee({ email: "owner@example.com" });

  const statuses = await employeeInviteService(orm).readStatuses(owner, [employee.id]);

  expect(statuses.get(employee.id)).toMatchObject({
    state: "not_invited",
    isWorkspaceOwner: true,
    canBeInvited: false,
  });
  expect(await employeeServices(orm).readEmployee(owner, employee.id)).toMatchObject({
    userId: null,
  });
});

test("identifies the linked owner even when their work email differs", async ({ orm, seed }) => {
  const owner = await seed.owner();
  const employee = await seed.employee({ userId: owner.user!.userId });

  const statuses = await employeeInviteService(orm).readStatuses(owner, [employee.id]);

  expect(statuses.get(employee.id)).toMatchObject({
    state: "joined",
    isWorkspaceOwner: true,
    canBeInvited: false,
  });
});

test("does not identify another account as the workspace owner", async ({ orm, seed }) => {
  const owner = await seed.owner();
  const user = await seed.user({ email: "other@example.com" });
  const employee = await seed.employee({ email: user.email });
  const linked = await seed.employee({ email: "owner@example.com", userId: user.id });

  const statuses = await employeeInviteService(orm).readStatuses(owner, [employee.id, linked.id]);

  expect(statuses.get(employee.id)).toMatchObject({ isWorkspaceOwner: false, canBeInvited: false });
  expect(statuses.get(linked.id)).toMatchObject({ isWorkspaceOwner: false, canBeInvited: false });
});

test("does not identify demo data as the workspace owner by email", async ({ orm, seed }) => {
  const owner = await seed.owner();
  const employee = await seed.employee({ email: "owner@example.com", isDemo: true });

  const statuses = await employeeInviteService(orm).readStatuses(owner, [employee.id]);

  expect(statuses.get(employee.id)).toMatchObject({ isWorkspaceOwner: false, canBeInvited: false });
});

test("reports not invited before a person has an invite", async ({ orm, seed }) => {
  const owner = await seed.owner();
  const employee = await seed.employee();

  const statuses = await employeeInviteService(orm).readStatuses(owner, [employee.id]);

  expect(statuses.get(employee.id)).toEqual({
    state: "not_invited",
    expiresAt: null,
    notSent: false,
    isWorkspaceOwner: false,
    emailHasAccount: false,
    canBeInvited: true,
  });
});

test("reports pending with an expiry seven days after sending", async ({ orm, seed }) => {
  const owner = await seed.owner();
  const employee = await seed.employee();
  const service = employeeInviteService(orm);
  const before = Date.now();

  const [sent] = await service.send(
    owner,
    { employeeIds: [employee.id] },
    "https://copy.example.com",
  );

  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  expect(sent!.expiresAt.getTime()).toBeGreaterThanOrEqual(before + sevenDays);
  expect(sent!.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + sevenDays);
  expect((await service.readStatuses(owner, [employee.id])).get(employee.id)).toEqual({
    state: "pending",
    expiresAt: sent!.expiresAt,
    notSent: false,
    isWorkspaceOwner: false,
    emailHasAccount: false,
    canBeInvited: true,
  });
});

test("keeps an expired invite pending", async ({ orm, seed }) => {
  const owner = await seed.owner();
  const employee = await seed.employee();
  const service = employeeInviteService(orm);
  const [sent] = await service.send(
    owner,
    { employeeIds: [employee.id] },
    "https://copy.example.com",
  );
  vi.useFakeTimers({ toFake: ["Date"] });
  onTestFinished(() => {
    vi.useRealTimers();
  });

  vi.setSystemTime(new Date(sent!.expiresAt.getTime() + 1));

  expect((await service.readStatuses(owner, [employee.id])).get(employee.id)).toEqual({
    state: "pending",
    expiresAt: sent!.expiresAt,
    notSent: false,
    isWorkspaceOwner: false,
    emailHasAccount: false,
    canBeInvited: true,
  });
});

test("reports joined for a person linked to a user", async ({ orm, seed }) => {
  const owner = await seed.owner();
  const user = await seed.user({ email: "joined@example.com" });
  const employee = await seed.employee({ userId: user.id });

  const statuses = await employeeInviteService(orm).readStatuses(owner, [employee.id]);

  expect(statuses.get(employee.id)).toMatchObject({
    state: "joined",
    expiresAt: null,
    notSent: false,
  });
});

test("reports that a demo employee cannot be invited", async ({ orm, seed }) => {
  const owner = await seed.owner();
  const employee = await seed.employee({ isDemo: true });

  const statuses = await employeeInviteService(orm).readStatuses(owner, [employee.id]);

  expect(statuses.get(employee.id)).toMatchObject({ state: "not_invited", canBeInvited: false });
});

test("lookup returns null after the person's email changed since the invite", async ({
  orm,
  seed,
}) => {
  const owner = await seed.owner();
  const employee = await seed.employee();
  const service = employeeInviteService(orm);
  const [sent] = await service.send(
    owner,
    { employeeIds: [employee.id], delivery: "copied_by_owner" },
    "https://copy.example.com",
  );
  const token = new URL(sent!.link!).hash.slice(1);
  await employeeServices(orm).updateEmployee(owner, { id: employee.id, email: "new@example.com" });

  const details = await service.lookUp(token);

  expect(details).toBeNull();
});
