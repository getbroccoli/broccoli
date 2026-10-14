import { expect, importUseCases, test } from "#test/support";

import { instanceRepository, readSetupStep } from "../../../../core/instance";

test("skipping import completes setup", async ({ orm, seed }) => {
  const owner = await seed.owner();
  await instanceRepository(orm).setOwner(owner.user!.userId, "import");
  const imports = importUseCases(orm);

  await imports.skipImport(owner);

  expect(await readSetupStep(orm)).toBe("done");
});

test.for(["owner", "company", "done"] as const)(
  "skipping import does nothing at the %s step",
  async (step, { orm, seed }) => {
    const owner = await seed.owner();
    await instanceRepository(orm).setOwner(owner.user!.userId, step);
    const imports = importUseCases(orm);

    await imports.skipImport(owner);

    expect(await readSetupStep(orm)).toBe(step);
  },
);
