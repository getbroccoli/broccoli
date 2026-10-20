import { expect, NON_OWNER, SETUP_HOLDER, SYSTEM, test } from "#test/support";

import { transactor } from "../../db";
import { createEventBus } from "../../events";
import { createLogger } from "../../logger";
import { instanceRepository } from "../db";
import { advanceStep, completeImportStep, readSetupStep } from ".";

test("refuses a non-owner advancing setup and keeps the current step", async ({
  orm,
  seed,
  transact,
}) => {
  await seed.owner();

  await expect(
    transact((tx) => advanceStep(NON_OWNER, tx, "company", "done")),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });

  expect(await readSetupStep(orm)).toBe("company");
});

test("publishes setup completion when the company step finishes", async ({ orm, seed }) => {
  await seed.owner();
  const eventBus = createEventBus(createLogger("silent"));
  const transact = transactor(orm, eventBus);
  const received: unknown[] = [];
  eventBus.subscribe({
    "instance.setup_completed": (payload) => {
      received.push(payload);
      return Promise.resolve();
    },
  });

  await transact((tx) => advanceStep(SYSTEM, tx, "company", "done"));

  expect(received).toEqual([null]);
});

test("does not publish setup completion again when the company step is already done", async ({
  orm,
  seed,
}) => {
  await seed.owner();
  const eventBus = createEventBus(createLogger("silent"));
  const transact = transactor(orm, eventBus);
  await transact((tx) => advanceStep(SYSTEM, tx, "company", "done"));
  const received: unknown[] = [];
  eventBus.subscribe({
    "instance.setup_completed": (payload) => {
      received.push(payload);
      return Promise.resolve();
    },
  });

  await transact((tx) => advanceStep(SYSTEM, tx, "company", "done"));

  expect(received).toEqual([]);
});

test("does not publish setup completion when advancing to the import step", async ({ orm }) => {
  const eventBus = createEventBus(createLogger("silent"));
  const transact = transactor(orm, eventBus);
  const received: unknown[] = [];
  eventBus.subscribe({
    "instance.setup_completed": (payload) => {
      received.push(payload);
      return Promise.resolve();
    },
  });

  await transact((tx) => advanceStep(SYSTEM, tx, "company", "import"));

  expect(received).toEqual([]);
});

test("a fresh instance starts at company", async ({ orm }) => {
  expect(await readSetupStep(orm)).toBe("company");
});

test("completing import moves to owner when no owner exists", async ({ orm, transact }) => {
  await instanceRepository(orm).advanceStep("company", "import");

  const moved = await transact((tx) => completeImportStep(SETUP_HOLDER, tx));

  expect(moved).toBe(true);
  expect(await readSetupStep(orm)).toBe("owner");
});

test("completing import moves to done when an owner exists", async ({ orm, seed, transact }) => {
  const owner = await seed.owner();
  await instanceRepository(orm).advanceStep("company", "import");

  const moved = await transact((tx) => completeImportStep(owner, tx));

  expect(moved).toBe(true);
  expect(await readSetupStep(orm)).toBe("done");
});

test.for(["company", "owner", "done"] as const)(
  "completing import does nothing at the %s step",
  async (step, { orm, transact }) => {
    await instanceRepository(orm).advanceStep("company", step);

    expect(await transact((tx) => completeImportStep(SETUP_HOLDER, tx))).toBe(false);
    expect(await readSetupStep(orm)).toBe(step);
  },
);
