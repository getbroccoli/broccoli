import { expect, test } from "#test/support";

import { createEventBus } from "../events";
import { advanceStep, readOnboardingStep } from "../instance";
import { createLogger } from "../logger";
import { runInTransaction } from ".";

test("dispatches queued events after the write commits", async ({ orm, seed }) => {
  const actor = await seed.owner();
  const owner = { userId: actor.userId, email: "owner@example.com" };
  const events = createEventBus(createLogger("silent"));
  const received: unknown[] = [];
  const steps: string[] = [];
  events.subscribe({
    "instance.owner_claimed": async (payload) => {
      received.push(payload);
      steps.push(await readOnboardingStep(orm));
    },
  });

  await runInTransaction(orm, events, async (tx) => {
    await advanceStep(tx, "company", "done");
    tx.publish("instance.owner_claimed", owner);
    expect(received).toEqual([]);
  });

  expect(received).toEqual([owner]);
  expect(steps).toEqual(["done"]);
});

test("rolls back the write and drops queued events when work fails", async ({ orm, seed }) => {
  const actor = await seed.owner();
  const events = createEventBus(createLogger("silent"));
  const received: unknown[] = [];
  events.subscribe({
    "instance.owner_claimed": (payload) => {
      received.push(payload);
      return Promise.resolve();
    },
  });

  await expect(
    runInTransaction(orm, events, async (tx) => {
      await advanceStep(tx, "company", "done");
      tx.publish("instance.owner_claimed", { userId: actor.userId, email: "owner@example.com" });
      throw new Error("Work failed");
    }),
  ).rejects.toThrow("Work failed");

  expect(await readOnboardingStep(orm)).toBe("company");
  expect(received).toEqual([]);
});

test("refuses to use a transaction after it has ended", async ({ orm, seed }) => {
  const actor = await seed.owner();
  const events = createEventBus(createLogger("silent"));
  const tx = await runInTransaction(orm, events, (tx) => Promise.resolve(tx));

  expect(() =>
    tx.publish("instance.owner_claimed", { userId: actor.userId, email: "owner@example.com" }),
  ).toThrow("The transaction has ended");
  await expect(advanceStep(tx, "company", "done")).rejects.toThrow("The transaction has ended");
  expect(await readOnboardingStep(orm)).toBe("company");
});
