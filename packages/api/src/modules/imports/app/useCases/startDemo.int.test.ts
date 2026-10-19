import { expect, importUseCases, SETUP_HOLDER, SYSTEM, test } from "#test/support";

import { instanceRepository, readSetupStep } from "../../../../core/instance";
import { hasEmployees } from "../../../employees";

test("starting the demo completes setup", async ({ orm, seed }) => {
  const owner = await seed.owner();
  await instanceRepository(orm).setOwner(owner.user!.userId, "import");
  const imports = importUseCases(orm);

  await imports.startDemo(owner);

  expect(await readSetupStep(orm)).toBe("done");
});

test.for(["owner", "company", "done"] as const)(
  "starting the demo does nothing at the %s step",
  async (step, { orm, seed, transact }) => {
    const owner = await seed.owner();
    await instanceRepository(orm).setOwner(owner.user!.userId, step);
    const imports = importUseCases(orm);

    await imports.startDemo(owner);

    expect(await readSetupStep(orm)).toBe(step);
    expect(await transact((tx) => hasEmployees(SYSTEM, tx))).toBe(false);
  },
);

test("the setup holder starts the demo without an owner and moves setup to owner", async ({
  orm,
}) => {
  await instanceRepository(orm).advanceStep("company", "import");
  const imports = importUseCases(orm);

  await imports.startDemo(SETUP_HOLDER);

  expect(await readSetupStep(orm)).toBe("owner");
});

test("starting the demo fills the demo company before an owner exists", async ({
  orm,
  transact,
}) => {
  await instanceRepository(orm).advanceStep("company", "import");
  const imports = importUseCases(orm);

  await imports.startDemo(SETUP_HOLDER);

  expect(await transact((tx) => hasEmployees(SYSTEM, tx))).toBe(true);
});

test("keeps setup at import when the demo fill fails", async ({ orm, transact }) => {
  await instanceRepository(orm).advanceStep("company", "import");
  const imports = importUseCases(orm, {
    prepareDemoFill: () => Promise.resolve(() => Promise.reject(new Error("fill failed"))),
  });

  await expect(imports.startDemo(SETUP_HOLDER)).rejects.toThrow("fill failed");

  expect(await readSetupStep(orm)).toBe("import");
  expect(await transact((tx) => hasEmployees(SYSTEM, tx))).toBe(false);
});
