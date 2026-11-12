import {
  calendarDate,
  companyService,
  employeeServices,
  expect,
  importServices,
  instances,
  readTermsPolicies,
  readTimeOffTerms,
  scotlandTimeOffSetup,
  systemService,
  test,
} from "#test/support";

import { NO_SETUP_INVITES } from "../../../core/instance";

test("after reset an existing owner chooses time off before finishing setup again", async ({
  orm,
  seed,
}) => {
  const owner = await seed.owner();
  await seed.setupStep("done");
  const system = systemService(orm);
  await system.resetSetup(owner);
  await companyService(orm).update(owner, { name: "Acme Corp" });
  const source = await seed.importSource();
  await seed.importEmployees(source.id, [
    { email: "avery@example.com", location: "Glasgow", startDate: calendarDate("2025-01-01") },
  ]);
  const imports = importServices(orm);

  await imports.approveImport(owner, (await imports.reads.readReview(owner)).version);

  expect((await instances.readInstance(orm)).step).toBe("ready");
  expect((await employeeServices(orm).listEmployees(owner, {})).edges).toEqual([]);

  await system.completeSetup(owner, {
    ...NO_SETUP_INVITES,
    timeOff: scotlandTimeOffSetup(),
    linkOrigin: "https://broccoli.example.com",
  });

  expect((await instances.readInstance(orm)).step).toBe("done");
  const { edges } = await employeeServices(orm).listEmployees(owner, {});
  expect(edges).toHaveLength(1);
  const scotland = (await readTimeOffTerms(orm)).find(({ name }) => name === "Scotland")!;
  expect(await readTermsPolicies(orm, scotland.id)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ typeKey: "annual_leave", entitlementDays: 25 }),
    ]),
  );
});
