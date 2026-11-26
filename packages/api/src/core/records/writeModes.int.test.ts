import { expect, signedIn, SYSTEM, test } from "#test/support";

import { createWriteModeService } from ".";

const { writeModes } = createWriteModeService();

test("employees can request their own time off and are refused for a colleague", async ({
  orm,
  seed,
}) => {
  const employee = await seed.employee();
  const colleague = await seed.employee();
  const ctx = signedIn(orm, { employeeId: employee.id, profiles: ["EMPLOYEE"] });

  const modes = await writeModes(ctx, "time_off", "create", [employee.id, colleague.id]);

  expect(modes).toEqual(
    new Map([
      [employee.id, "request"],
      [colleague.id, "refused"],
    ]),
  );
});

test("admins can book time off directly for themselves and a colleague", async ({ orm, seed }) => {
  const admin = await seed.employee();
  const colleague = await seed.employee();
  const ctx = signedIn(orm, { employeeId: admin.id, profiles: ["ADMIN"] });

  const modes = await writeModes(ctx, "time_off", "create", [admin.id, colleague.id]);

  expect(modes).toEqual(
    new Map([
      [admin.id, "direct"],
      [colleague.id, "direct"],
    ]),
  );
});

test("a manager with create grants for self and reports can book for a report and request for themselves", async ({
  orm,
  seed,
}) => {
  const manager = await seed.employee();
  const report = await seed.employee();
  await seed.manager(report.id, manager.id);
  const ctx = signedIn(orm, {
    employeeId: manager.id,
    grants: [
      {
        key: "time_off.create.all_reports",
        object: "time_off",
        actions: ["create"],
        scope: "all_reports",
      },
      { key: "time_off.create.self", object: "time_off", actions: ["create"], scope: "self" },
    ],
  });

  const modes = await writeModes(ctx, "time_off", "create", [manager.id, report.id]);

  expect(modes).toEqual(
    new Map([
      [manager.id, "request"],
      [report.id, "direct"],
    ]),
  );
});

test("the system can book time off directly", async ({ seed }) => {
  const employee = await seed.employee();

  const modes = await writeModes(SYSTEM, "time_off", "create", [employee.id]);

  expect(modes.get(employee.id)).toBe("direct");
});

test("a user without an employee can book directly with a grant for everyone", async ({
  orm,
  seed,
}) => {
  const employee = await seed.employee();
  const ctx = signedIn(orm, {
    employeeId: null,
    grants: [{ key: "time_off.create.all", object: "time_off", actions: ["create"], scope: "all" }],
  });

  const modes = await writeModes(ctx, "time_off", "create", [employee.id]);

  expect(modes.get(employee.id)).toBe("direct");
});

test("a user without an employee or grants is refused", async ({ orm, seed }) => {
  const employee = await seed.employee();
  const ctx = signedIn(orm, { employeeId: null, grants: [] });

  const modes = await writeModes(ctx, "time_off", "create", [employee.id]);

  expect(modes.get(employee.id)).toBe("refused");
});
