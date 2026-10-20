import { expect, NON_OWNER, SETUP_HOLDER, SYSTEM, test } from "#test/support";

import { transactor } from "../../db";
import { createEventBus } from "../../events";
import { createLogger } from "../../logger";
import {
  approveImportStep,
  completeCompanyStep,
  completeImportStep,
  completeReadyStep,
  readSetupStep,
} from ".";

test("refuses a non-owner completing the company step and keeps the current step", async ({
  orm,
  seed,
  transact,
}) => {
  await seed.owner();

  await expect(transact((tx) => completeCompanyStep(NON_OWNER, tx))).rejects.toMatchObject({
    code: "FORBIDDEN",
  });

  expect(await readSetupStep(orm)).toBe("company");
});

test("completing the company step moves setup to import without publishing completion", async ({
  orm,
}) => {
  const eventBus = createEventBus(createLogger("silent"));
  const transact = transactor(orm, eventBus);
  const received: unknown[] = [];
  eventBus.subscribe({
    "instance.setup_completed": (payload) => {
      received.push(payload);
      return Promise.resolve();
    },
  });

  const moved = await transact((tx) => completeCompanyStep(SYSTEM, tx));

  expect(moved).toBe(true);
  expect(await readSetupStep(orm)).toBe("import");
  expect(received).toEqual([]);
});

test.for(["import", "owner", "ready", "done"] as const)(
  "completing the company step does nothing at the %s step",
  async (step, { orm, seed, transact }) => {
    await seed.setupStep(step);

    const moved = await transact((tx) => completeCompanyStep(SYSTEM, tx));

    expect(moved).toBe(false);
    expect(await readSetupStep(orm)).toBe(step);
  },
);

test("completing the ready step moves setup to done and publishes completion once", async ({
  orm,
  seed,
}) => {
  await seed.owner();
  await seed.setupStep("ready");
  const eventBus = createEventBus(createLogger("silent"));
  const transact = transactor(orm, eventBus);
  const received: unknown[] = [];
  eventBus.subscribe({
    "instance.setup_completed": (payload) => {
      received.push(payload);
      return Promise.resolve();
    },
  });

  const moved = await transact((tx) => completeReadyStep(SYSTEM, tx));

  expect(moved).toBe(true);
  expect(await readSetupStep(orm)).toBe("done");
  expect(received).toEqual([null]);
});

test("completing the ready step again publishes nothing", async ({ orm, seed }) => {
  await seed.owner();
  await seed.setupStep("done");
  const eventBus = createEventBus(createLogger("silent"));
  const transact = transactor(orm, eventBus);
  const received: unknown[] = [];
  eventBus.subscribe({
    "instance.setup_completed": (payload) => {
      received.push(payload);
      return Promise.resolve();
    },
  });

  const moved = await transact((tx) => completeReadyStep(SYSTEM, tx));

  expect(moved).toBe(false);
  expect(await readSetupStep(orm)).toBe("done");
  expect(received).toEqual([]);
});

test("a fresh instance starts at company", async ({ orm }) => {
  expect(await readSetupStep(orm)).toBe("company");
});

test("completing import moves to owner when no owner exists", async ({ orm, seed, transact }) => {
  await seed.setupStep("import");

  const moved = await transact((tx) => completeImportStep(SETUP_HOLDER, tx));

  expect(moved).toBe(true);
  expect(await readSetupStep(orm)).toBe("owner");
});

test("completing import moves to done when an owner exists", async ({ orm, seed, transact }) => {
  const owner = await seed.owner();
  await seed.setupStep("import");

  const moved = await transact((tx) => completeImportStep(owner, tx));

  expect(moved).toBe(true);
  expect(await readSetupStep(orm)).toBe("done");
});

test.for(["company", "owner", "done"] as const)(
  "completing import does nothing at the %s step",
  async (step, { orm, seed, transact }) => {
    await seed.setupStep(step);

    expect(await transact((tx) => completeImportStep(SETUP_HOLDER, tx))).toBe(false);
    expect(await readSetupStep(orm)).toBe(step);
  },
);

test("approving import moves to ready when an owner exists", async ({ orm, seed, transact }) => {
  const owner = await seed.owner();
  await seed.setupStep("import");

  const moved = await transact((tx) => approveImportStep(owner, tx));

  expect(moved).toBe(true);
  expect(await readSetupStep(orm)).toBe("ready");
});

test("approving import moves to owner when no owner exists", async ({ orm, seed, transact }) => {
  await seed.setupStep("import");

  const moved = await transact((tx) => approveImportStep(SETUP_HOLDER, tx));

  expect(moved).toBe(true);
  expect(await readSetupStep(orm)).toBe("owner");
});
