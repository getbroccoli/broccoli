import {
  employeeDirectory,
  employeeServices,
  expect,
  recordHistory,
  signedIn,
  test,
} from "#test/support";

import { session } from "../../auth";
import type { Orm } from "../../db";
import { createLogger } from "../../logger";
import { createActingAsService } from "./actingAsService";

test("an admin may act as any other employee", async ({ orm, seed }) => {
  const admin = await seed.employee();
  const employees = await seed.employees(2);
  const ctx = signedIn(orm, { employeeId: admin.id, profiles: ["EMPLOYEE", "ADMIN"] });
  const ids = employees.map(({ id }) => id);

  expect(await actingAs(orm).actableEmployees(ctx, ids)).toEqual(new Set(ids));
});

test("a manager may act as a direct report", async ({ orm, seed }) => {
  const manager = await seed.employee();
  const report = await seed.employee();
  await seed.manager(report.id, manager.id);
  const ctx = signedIn(orm, { employeeId: manager.id, profiles: ["EMPLOYEE"] });

  expect(await actingAs(orm).actableEmployees(ctx, [report.id])).toEqual(new Set([report.id]));
});

test("a manager may not act as someone below a direct report", async ({ orm, seed }) => {
  const manager = await seed.employee();
  const report = await seed.employee();
  const indirect = await seed.employee();
  await seed.manager(report.id, manager.id);
  await seed.manager(indirect.id, report.id);
  const ctx = signedIn(orm, { employeeId: manager.id, profiles: ["EMPLOYEE"] });

  expect(await actingAs(orm).actableEmployees(ctx, [indirect.id])).toEqual(new Set());
});

test("an employee may not act as an unrelated colleague or their own manager", async ({
  orm,
  seed,
}) => {
  const employee = await seed.employee();
  const colleague = await seed.employee();
  const manager = await seed.employee();
  await seed.manager(employee.id, manager.id);
  const ctx = signedIn(orm, { employeeId: employee.id, profiles: ["EMPLOYEE"] });

  expect(await actingAs(orm).actableEmployees(ctx, [colleague.id, manager.id])).toEqual(new Set());
});

test("even an owner may not act as themselves", async ({ orm, seed }) => {
  const owner = await seed.owner();
  const employee = await seed.employee({ userId: owner.user!.userId });
  const ctx = signedIn(orm, { employeeId: employee.id, profiles: ["EMPLOYEE", "OWNER"] });

  expect(await actingAs(orm).actableEmployees(ctx, [employee.id])).toEqual(new Set());
});

test("refuses a second start from a caller who read the session before acting began", async ({
  orm,
  seed,
}) => {
  const owner = await seed.owner();
  const first = await seed.employee();
  const other = await seed.employee();
  const sessionId = await seedSession(orm, owner.user!.userId);
  const service = actingAs(orm);
  await service.startActing(owner, { sessionId, employeeId: first.id });

  await expect(
    service.startActing(owner, { sessionId, employeeId: other.id }),
  ).rejects.toMatchObject({
    code: "FORBIDDEN",
    message: "You are acting as someone already.",
  });
  expect(await orm.select({ employeeId: session.actingAsEmployeeId }).from(session)).toEqual([
    { employeeId: first.id },
  ]);
});

test("ending ineligible acting keeps a newer selection in the same session", async ({
  orm,
  seed,
}) => {
  const owner = await seed.owner();
  const former = await seed.employee();
  const current = await seed.employee();
  const sessionId = await seedSession(orm, owner.user!.userId);
  const service = actingAs(orm);
  const earlier = { sessionId, employeeId: former.id };
  await service.startActing(owner, earlier);
  await service.stopActing(owner, sessionId);
  await service.startActing(owner, { sessionId, employeeId: current.id });
  await employeeServices(orm).deleteEmployee(owner, { id: former.id });

  expect(await service.resolveActing(owner, earlier)).toBeNull();

  expect(await orm.select({ employeeId: session.actingAsEmployeeId }).from(session)).toEqual([
    { employeeId: current.id },
  ]);
});

test("someone already acting may not act as anyone else", async ({ orm, seed }) => {
  const admin = await seed.user({ email: "casey@example.com", permissionProfiles: ["ADMIN"] });
  const employee = await seed.employee({ userId: admin.id });
  const other = await seed.employee();
  const actor = signedIn(orm, { employeeId: null, profiles: ["EMPLOYEE", "ADMIN"] });
  const service = actingAs(orm);
  const acting = await service.resolveActing(actor, {
    sessionId: "session",
    employeeId: employee.id,
  });
  expect(acting).not.toBeNull();

  expect(await service.actableEmployees(acting!, [other.id])).toEqual(new Set());
});

test("a manager may not act as a direct report who holds a profile they lack", async ({
  orm,
  seed,
}) => {
  const manager = await seed.employee();
  const admin = await seed.user({ email: "casey@example.com", permissionProfiles: ["ADMIN"] });
  const report = await seed.employee({ userId: admin.id });
  await seed.manager(report.id, manager.id);
  const ctx = signedIn(orm, { employeeId: manager.id, profiles: ["EMPLOYEE"] });

  expect(await actingAs(orm).actableEmployees(ctx, [report.id])).toEqual(new Set());
});

test("an admin may not act as the owner's employee", async ({ orm, seed }) => {
  const owner = await seed.owner();
  const employee = await seed.employee({ userId: owner.user!.userId });
  const ctx = signedIn(orm, { employeeId: null, profiles: ["EMPLOYEE", "ADMIN"] });

  expect(await actingAs(orm).actableEmployees(ctx, [employee.id])).toEqual(new Set());
});

test("acting uses the employee's live profiles and keeps the signed-in actor", async ({
  orm,
  seed,
}) => {
  const joined = await seed.user({ email: "casey@example.com", permissionProfiles: ["ADMIN"] });
  const employee = await seed.employee({ userId: joined.id });
  const actor = signedIn(orm, { employeeId: null, profiles: ["EMPLOYEE", "ADMIN", "OWNER"] });
  const service = actingAs(orm);
  const session = { sessionId: "session", employeeId: employee.id };

  const before = await service.resolveActing(actor, session);
  expect(before?.user?.permissionProfiles).toEqual(["EMPLOYEE", "ADMIN"]);
  await employeeServices(orm).setPermissionProfiles(actor, { id: employee.id, profiles: [] });
  const after = await service.resolveActing(actor, session);

  expect(after?.actor).toEqual(actor.user);
  expect(after?.user).toEqual({
    ...actor.user,
    employeeId: employee.id,
    isOwner: false,
    permissionProfiles: ["EMPLOYEE"],
  });
});

test("acting ends when a direct report moves to another manager", async ({ orm, seed }) => {
  const manager = await seed.employee();
  const other = await seed.employee();
  const report = await seed.employee();
  await seed.manager(report.id, manager.id);
  const caller = () => signedIn(orm, { employeeId: manager.id, profiles: ["EMPLOYEE"] });
  const session = { sessionId: "session", employeeId: report.id };
  const service = actingAs(orm);
  expect(await service.resolveActing(caller(), session)).not.toBeNull();

  await seed.manager(report.id, other.id);

  expect(await service.resolveActing(caller(), session)).toBeNull();
});

test("a change made while acting names the signed-in user as its change author", async ({
  orm,
  seed,
}) => {
  const joined = await seed.user({ email: "casey@example.com" });
  const employee = await seed.employee({ userId: joined.id });
  const actor = signedIn(orm, { employeeId: null, profiles: ["EMPLOYEE", "ADMIN"] });
  const acting = await actingAs(orm).resolveActing(actor, {
    sessionId: "session",
    employeeId: employee.id,
  });
  expect(acting).not.toBeNull();

  await employeeServices(orm).updateEmployee(acting!, { id: employee.id, firstName: "Rowan" });

  const history = await recordHistory.read(orm, "employee", employee.id, {});
  expect(history.edges.map(({ node }) => node.author)).toMatchObject([
    { kind: "SIGNED_IN_USER", id: actor.user!.userId },
  ]);
});

function actingAs(orm: Orm) {
  return createActingAsService({
    orm,
    directory: employeeDirectory(orm),
    logger: createLogger("silent"),
  });
}

async function seedSession(orm: Orm, userId: string) {
  const id = "browser-session";
  await orm.insert(session).values({
    id,
    userId,
    token: "session-token",
    expiresAt: new Date("2099-01-01T00:00:00Z"),
  });
  return id;
}
