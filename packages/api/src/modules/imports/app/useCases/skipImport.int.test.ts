import { expect, importUseCases, SETUP_HOLDER, SYSTEM, test } from "#test/support";

import { instanceRepository, readSetupStep } from "../../../../core/instance";
import { hasEmployees } from "../../../employees";

test("skipping import completes setup", async ({ orm, seed }) => {
  const owner = await seed.owner();
  await instanceRepository(orm).setOwner(owner.user!.userId, "import");
  const imports = importUseCases(orm);

  await imports.skipImport(owner);

  expect(await readSetupStep(orm)).toBe("done");
});

test.for(["owner", "company", "done"] as const)(
  "skipping import does nothing at the %s step",
  async (step, { orm, seed, transact }) => {
    const owner = await seed.owner();
    await instanceRepository(orm).setOwner(owner.user!.userId, step);
    const imports = importUseCases(orm);

    await imports.skipImport(owner);

    expect(await readSetupStep(orm)).toBe(step);
    expect(await transact((tx) => hasEmployees(SYSTEM, tx))).toBe(false);
  },
);

test("the setup holder skips import without an owner and moves setup to owner", async ({ orm }) => {
  await instanceRepository(orm).advanceStep("company", "import");
  const imports = importUseCases(orm);

  await imports.skipImport(SETUP_HOLDER);

  expect(await readSetupStep(orm)).toBe("owner");
});

test("skipping import fills the demo company before an owner exists", async ({ orm, transact }) => {
  await instanceRepository(orm).advanceStep("company", "import");
  const imports = importUseCases(orm);

  await imports.skipImport(SETUP_HOLDER);

  expect(await transact((tx) => hasEmployees(SYSTEM, tx))).toBe(true);
});

test("keeps setup at import when the demo fill fails", async ({ orm, transact }) => {
  await instanceRepository(orm).advanceStep("company", "import");
  const imports = importUseCases(orm, {
    prepareDemoFill: () => Promise.resolve(() => Promise.reject(new Error("fill failed"))),
  });

  await expect(imports.skipImport(SETUP_HOLDER)).rejects.toThrow("fill failed");

  expect(await readSetupStep(orm)).toBe("import");
  expect(await transact((tx) => hasEmployees(SYSTEM, tx))).toBe(false);
});
