import { EXAMPLE_PAYLOAD, expect, test } from "#test/support";

import { createEventBus } from "../events";
import { advanceStep, readSetupStep } from "../instance";
import { createLogger } from "../logger";
import { runInTransaction } from ".";

test("dispatches queued events after the write commits", async ({ orm, seed }) => {
  await seed.owner();
  const eventBus = createEventBus(createLogger("silent"));
  const received: unknown[] = [];
  const steps: string[] = [];
  eventBus.subscribe({
    "example.happened": async (payload) => {
      received.push(payload);
      steps.push(await readSetupStep(orm));
    },
  });

  await runInTransaction(orm, eventBus, async (tx) => {
    await advanceStep(tx, "company", "done");
    tx.publish("example.happened", EXAMPLE_PAYLOAD);
    expect(received).toEqual([]);
  });

  expect(received).toEqual([EXAMPLE_PAYLOAD]);
  expect(steps).toEqual(["done"]);
});

test("rolls back the write and drops queued events when work fails", async ({ orm, seed }) => {
  await seed.owner();
  const eventBus = createEventBus(createLogger("silent"));
  const received: unknown[] = [];
  eventBus.subscribe({
    "example.happened": (payload) => {
      received.push(payload);
      return Promise.resolve();
    },
  });

  await expect(
    runInTransaction(orm, eventBus, async (tx) => {
      await advanceStep(tx, "company", "done");
      tx.publish("example.happened", EXAMPLE_PAYLOAD);
      throw new Error("Work failed");
    }),
  ).rejects.toThrow("Work failed");

  expect(await readSetupStep(orm)).toBe("company");
  expect(received).toEqual([]);
});

test("refuses to use a transaction after it has ended", async ({ orm, seed }) => {
  await seed.owner();
  const eventBus = createEventBus(createLogger("silent"));
  const tx = await runInTransaction(orm, eventBus, (tx) => Promise.resolve(tx));

  expect(() => tx.publish("example.happened", EXAMPLE_PAYLOAD)).toThrow(
    "The transaction has ended",
  );
  await expect(advanceStep(tx, "company", "done")).rejects.toThrow("The transaction has ended");
  expect(await readSetupStep(orm)).toBe("company");
});

test("refuses the publisher's transaction inside an after-commit handler", async ({
  orm,
  seed,
}) => {
  await seed.owner();
  const eventBus = createEventBus(createLogger("silent"));
  let rejection: unknown;

  await runInTransaction(orm, eventBus, (retainedTx) => {
    eventBus.subscribe({
      "example.happened": async () => {
        try {
          await advanceStep(retainedTx, "company", "done");
        } catch (error) {
          rejection = error;
        }
      },
    });
    retainedTx.publish("example.happened", EXAMPLE_PAYLOAD);
    return Promise.resolve();
  });

  expect(rejection).toEqual(new Error("The transaction has ended"));
  expect(await readSetupStep(orm)).toBe("company");
});
