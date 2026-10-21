import { expect, NON_OWNER, systemUseCases, test } from "#test/support";

import { readInstance } from "../../../../core/instance";

test("completes setup from the ready step", async ({ orm, seed }) => {
  const owner = await seed.owner();
  await seed.setupStep("ready");
  const system = systemUseCases(orm);

  await system.completeSetup(owner);

  expect((await readInstance(orm)).setupStep).toBe("done");
});

test("does nothing at the import step", async ({ orm, seed }) => {
  const owner = await seed.owner();
  await seed.setupStep("import");
  const system = systemUseCases(orm);

  await system.completeSetup(owner);

  expect((await readInstance(orm)).setupStep).toBe("import");
});

test("refuses a non-owner completing setup and keeps the ready step", async ({ orm, seed }) => {
  await seed.owner();
  await seed.setupStep("ready");
  const system = systemUseCases(orm);

  await expect(system.completeSetup(NON_OWNER)).rejects.toMatchObject({ code: "FORBIDDEN" });

  expect((await readInstance(orm)).setupStep).toBe("ready");
});
