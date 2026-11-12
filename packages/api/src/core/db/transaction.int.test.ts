import { EXAMPLE_PAYLOAD, expect, SYSTEM, test, instances, setupSteps } from "#test/support";

import { createEventBus, type PublishedEvent } from "../events";
import { createLogger } from "../logger";
import { createBeforeCommitBus, MAX_BEFORE_COMMIT_ROUNDS, transactor } from ".";

test("dispatches queued events after the write commits", async ({ orm, seed }) => {
  await seed.owner();
  const eventBus = createEventBus(createLogger("silent"));
  const transact = transactor(orm, eventBus);
  const received: unknown[] = [];
  const steps: string[] = [];
  eventBus.subscribe({
    "example.happened": async (payload) => {
      received.push(payload);
      steps.push((await instances.readInstance(orm)).step);
    },
  });

  await transact(async (tx) => {
    await setupSteps.completeCompanyStep(SYSTEM, tx);
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
      await setupSteps.completeCompanyStep(SYSTEM, tx);
      tx.publish("example.happened", EXAMPLE_PAYLOAD);
      throw new Error("Work failed");
    }),
  ).rejects.toThrow("Work failed");

  expect((await instances.readInstance(orm)).step).toBe("company");
  expect(received).toEqual([]);
});

test("refuses to use a transaction after it has ended", async ({ orm, seed, transact }) => {
  await seed.owner();
  const tx = await transact((tx) => Promise.resolve(tx));

  expect(() => tx.publish("example.happened", EXAMPLE_PAYLOAD)).toThrow(
    "The transaction has ended",
  );
  await expect(setupSteps.completeCompanyStep(SYSTEM, tx)).rejects.toThrow(
    "The transaction has ended",
  );
  expect((await instances.readInstance(orm)).step).toBe("company");
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
          await setupSteps.completeCompanyStep(SYSTEM, retainedTx);
        } catch (error) {
          rejection = error;
        }
      },
    });
    retainedTx.publish("example.happened", EXAMPLE_PAYLOAD);
    return Promise.resolve();
  });

  expect(rejection).toEqual(new Error("The transaction has ended"));
  expect((await instances.readInstance(orm)).step).toBe("company");
});

test("hands identified events to handlers before committing their writes with the work", async ({
  orm,
  seed,
}) => {
  await seed.owner();
  await seed.assignment();
  const beforeCommit = createBeforeCommitBus();
  const transact = transactor(orm, createEventBus(createLogger("silent")), beforeCommit);
  const received: PublishedEvent[] = [];
  beforeCommit.subscribe(async (tx, events) => {
    received.push(...events);
    expect((await instances.readInstance(orm)).step).toBe("company");
    expect((await instances.readInstance(tx)).step).toBe("import");
    await setupSteps.approveImportStep(SYSTEM, tx);
  });

  await transact(async (tx) => {
    await setupSteps.completeCompanyStep(SYSTEM, tx);
    tx.publish("example.happened", EXAMPLE_PAYLOAD);
    tx.publish("example.happened", { id: "example-2" });
  });

  expect(received).toEqual([
    { id: expect.any(String) as unknown, type: "example.happened", payload: EXAMPLE_PAYLOAD },
    { id: expect.any(String) as unknown, type: "example.happened", payload: { id: "example-2" } },
  ]);
  expect(received[0]!.id).toMatch(/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/);
  expect(received[1]!.id).not.toBe(received[0]!.id);
  expect((await instances.readInstance(orm)).step).toBe("ready");
});

test("delivers handler-published events in the next round and after the commit", async ({
  orm,
  seed,
}) => {
  await seed.owner();
  const eventBus = createEventBus(createLogger("silent"));
  const beforeCommit = createBeforeCommitBus();
  const transact = transactor(orm, eventBus, beforeCommit);
  const rounds: (readonly PublishedEvent[])[] = [];
  const received: unknown[] = [];
  beforeCommit.subscribe((tx, events) => {
    rounds.push(events);
    expect(received).toEqual([]);
    if (
      events.some(
        (event) => event.type === "example.happened" && event.payload.id === EXAMPLE_PAYLOAD.id,
      )
    ) {
      tx.publish("example.happened", { id: "from-handler" });
    }
    return Promise.resolve();
  });
  eventBus.subscribe({
    "example.happened": async (payload) => {
      expect((await instances.readInstance(orm)).step).toBe("import");
      received.push(payload);
    },
  });

  await transact(async (tx) => {
    await setupSteps.completeCompanyStep(SYSTEM, tx);
    tx.publish("example.happened", EXAMPLE_PAYLOAD);
  });

  expect(rounds).toMatchObject([
    [{ type: "example.happened", payload: EXAMPLE_PAYLOAD }],
    [{ type: "example.happened", payload: { id: "from-handler" } }],
  ]);
  expect(received).toEqual([EXAMPLE_PAYLOAD, { id: "from-handler" }]);
});

test("rolls back the work and delivers no events when a before-commit handler fails", async ({
  orm,
  seed,
}) => {
  await seed.owner();
  const eventBus = createEventBus(createLogger("silent"));
  const beforeCommit = createBeforeCommitBus();
  const transact = transactor(orm, eventBus, beforeCommit);
  const received: unknown[] = [];
  const failure = new Error("Cannot start the work");
  eventBus.subscribe({
    "example.happened": (payload) => {
      received.push(payload);
      return Promise.resolve();
    },
  });
  beforeCommit.subscribe(async (tx) => {
    await setupSteps.approveImportStep(SYSTEM, tx);
    tx.publish("example.happened", { id: "from-handler" });
    throw failure;
  });

  await expect(
    transact(async (tx) => {
      await setupSteps.completeCompanyStep(SYSTEM, tx);
      tx.publish("example.happened", EXAMPLE_PAYLOAD);
    }),
  ).rejects.toBe(failure);

  expect((await instances.readInstance(orm)).step).toBe("company");
  expect(received).toEqual([]);
});

test("rolls back events that keep publishing after ten before-commit rounds", async ({
  orm,
  seed,
}) => {
  await seed.owner();
  const eventBus = createEventBus(createLogger("silent"));
  const beforeCommit = createBeforeCommitBus();
  const transact = transactor(orm, eventBus, beforeCommit);
  const received: unknown[] = [];
  const rounds: (readonly PublishedEvent[])[] = [];
  eventBus.subscribe({
    "example.happened": (payload) => {
      received.push(payload);
      return Promise.resolve();
    },
  });
  beforeCommit.subscribe((tx, events) => {
    rounds.push(events);
    tx.publish("example.happened", EXAMPLE_PAYLOAD);
    return Promise.resolve();
  });

  await expect(
    transact(async (tx) => {
      await setupSteps.completeCompanyStep(SYSTEM, tx);
      tx.publish("example.happened", EXAMPLE_PAYLOAD);
    }),
  ).rejects.toThrow("Events kept publishing more events before the commit after 10 rounds.");

  expect(rounds).toHaveLength(MAX_BEFORE_COMMIT_ROUNDS);
  expect(rounds).toHaveLength(10);
  expect((await instances.readInstance(orm)).step).toBe("company");
  expect(received).toEqual([]);
});
