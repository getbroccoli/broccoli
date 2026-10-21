import { EXAMPLE_PAYLOAD, expect, SYSTEM, test } from "#test/support";

import { createEventBus } from "../events";
import { completeCompanyStep, readInstance } from "../instance";
import { createLogger } from "../logger";
import { transactor } from ".";

test("dispatches queued events after the write commits", async ({ orm, seed }) => {
  await seed.owner();
  const eventBus = createEventBus(createLogger("silent"));
  const transact = transactor(orm, eventBus);
  const received: unknown[] = [];
  const steps: string[] = [];
  eventBus.subscribe({
    "example.happened": async (payload) => {
      received.push(payload);
      steps.push((await readInstance(orm)).step);
    },
  });

  await transact(async (tx) => {
    await completeCompanyStep(SYSTEM, tx);
    tx.publish("example.happened", EXAMPLE_PAYLOAD);
    expect(received).toEqual([]);
  });

  expect(received).toEqual([EXAMPLE_PAYLOAD]);
  expect(steps).toEqual(["import"]);
});

test("rolls back the write and drops queued events when work fails", async ({ orm, seed }) => {
  await seed.owner();
  const eventBus = createEventBus(createLogger("silent"));
  const transact = transactor(orm, eventBus);
  const received: unknown[] = [];
  eventBus.subscribe({
    "example.happened": (payload) => {
      received.push(payload);
      return Promise.resolve();
    },
  });

  await expect(
    transact(async (tx) => {
      await completeCompanyStep(SYSTEM, tx);
      tx.publish("example.happened", EXAMPLE_PAYLOAD);
      throw new Error("Work failed");
    }),
  ).rejects.toThrow("Work failed");

  expect((await readInstance(orm)).step).toBe("company");
  expect(received).toEqual([]);
});

test("refuses to use a transaction after it has ended", async ({ orm, seed, transact }) => {
  await seed.owner();
  const tx = await transact((tx) => Promise.resolve(tx));

  expect(() => tx.publish("example.happened", EXAMPLE_PAYLOAD)).toThrow(
    "The transaction has ended",
  );
  await expect(completeCompanyStep(SYSTEM, tx)).rejects.toThrow("The transaction has ended");
  expect((await readInstance(orm)).step).toBe("company");
});

test("refuses the publisher's transaction inside an after-commit handler", async ({
  orm,
  seed,
}) => {
  await seed.owner();
  const eventBus = createEventBus(createLogger("silent"));
  const transact = transactor(orm, eventBus);
  let rejection: unknown;

  await transact((retainedTx) => {
    eventBus.subscribe({
      "example.happened": async () => {
        try {
          await completeCompanyStep(SYSTEM, retainedTx);
        } catch (error) {
          rejection = error;
        }
      },
    });
    retainedTx.publish("example.happened", EXAMPLE_PAYLOAD);
    return Promise.resolve();
  });

  expect(rejection).toEqual(new Error("The transaction has ended"));
  expect((await readInstance(orm)).step).toBe("company");
});
