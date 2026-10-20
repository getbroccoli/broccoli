import { expect, NON_OWNER, systemUseCases, test } from "#test/support";

import { instanceRepository, readSetupStep } from "../../../../core/instance";

test("completes setup from the ready step", async ({ orm, seed }) => {
  const owner = await seed.owner();
  await instanceRepository(orm).setOwner(owner.user!.userId, "ready");
  const system = systemUseCases(orm, { mode: "managed" });

  await system.completeSetup(owner);

  expect(await readSetupStep(orm)).toBe("done");
});

test("does nothing at the import step", async ({ orm, seed }) => {
  const owner = await seed.owner();
  await instanceRepository(orm).setOwner(owner.user!.userId, "import");
  const system = systemUseCases(orm, { mode: "managed" });

  await system.completeSetup(owner);

  expect(await readSetupStep(orm)).toBe("import");
});

test("refuses a non-owner completing setup and keeps the ready step", async ({ orm, seed }) => {
  const owner = await seed.owner();
  await instanceRepository(orm).setOwner(owner.user!.userId, "ready");
  const system = systemUseCases(orm, { mode: "managed" });

  await expect(system.completeSetup(NON_OWNER)).rejects.toMatchObject({ code: "FORBIDDEN" });

  expect(await readSetupStep(orm)).toBe("ready");
});
