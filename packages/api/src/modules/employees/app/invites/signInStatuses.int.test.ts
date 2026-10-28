import { onTestFinished, vi } from "vitest";
import { employeeInviteService, expect, test } from "#test/support";

test("reports not invited before a person has an invite", async ({ orm, seed }) => {
  const owner = await seed.owner();
  const employee = await seed.employee();

  const statuses = await employeeInviteService(orm).readStatuses(owner, [employee.id]);

  expect(statuses.get(employee.id)).toEqual({
    state: "not_invited",
    expiresAt: null,
    notSent: false,
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
