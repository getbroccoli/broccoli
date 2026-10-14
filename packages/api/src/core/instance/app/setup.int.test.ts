import { expect, NON_OWNER, SYSTEM, test } from "#test/support";

import { transactor } from "../../db";
import { createEventBus } from "../../events";
import { createLogger } from "../../logger";
import { advanceStep, readSetupStep } from ".";

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

test("does not publish setup completion when advancing to the company step", async ({ orm }) => {
  const eventBus = createEventBus(createLogger("silent"));
  const transact = transactor(orm, eventBus);
  const received: unknown[] = [];
  eventBus.subscribe({
    "instance.setup_completed": (payload) => {
      received.push(payload);
      return Promise.resolve();
    },
  });

  await transact((tx) => advanceStep(SYSTEM, tx, "owner", "company"));

  expect(received).toEqual([]);
});
