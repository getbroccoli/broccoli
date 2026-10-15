import { EXAMPLE_JOB, expect, test as baseTest } from "#test/support";

import { createLogger } from "../logger";
import { createJobRunner, type JobRunner } from ".";

const test = baseTest.extend<{ runner: JobRunner }>({
  runner: async ({ databaseUrl }, use) => {
    const runner = createJobRunner(databaseUrl, createLogger("silent"), { retryDelaySeconds: 0 });
    try {
      await use(runner);
    } finally {
      await runner.stop();
    }
  },
});

test("runs a job sent in a committed transaction once", async ({ runner, transact }) => {
  const ran: (typeof EXAMPLE_JOB)[] = [];
  await runner.start([
    {
      "example.ran": {
        run: (payload) => {
          ran.push(payload);
          return Promise.resolve();
        },
        onFailed: () => {
          throw new Error("The job should succeed");
        },
      },
    },
  ]);

  await transact((tx) => runner.queue.send(tx, "example.ran", EXAMPLE_JOB));

  await expect.poll(() => ran, { timeout: 5_000 }).toEqual([EXAMPLE_JOB]);
  await runner.stop();
  expect(ran).toEqual([EXAMPLE_JOB]);
});

test("never runs a job sent in a rolled-back transaction", async ({ runner, transact }) => {
  const ran: (typeof EXAMPLE_JOB)[] = [];
  await runner.start([
    {
      "example.ran": {
        run: (payload) => {
          ran.push(payload);
          return Promise.resolve();
        },
        onFailed: () => {
          throw new Error("The job should succeed");
        },
      },
    },
  ]);
  const rollback = new Error("Roll back");

  await expect(
    transact(async (tx) => {
      await runner.queue.send(tx, "example.ran", EXAMPLE_JOB);
      throw rollback;
    }),
  ).rejects.toBe(rollback);
  const committed = { id: "committed" };
  await transact((tx) => runner.queue.send(tx, "example.ran", committed));

  await expect.poll(() => ran, { timeout: 5_000 }).toContainEqual(committed);
  await runner.stop();
  expect(ran).toEqual([committed]);
});

test("calls onFailed with the payload after the third failed attempt", async ({
  runner,
  transact,
}) => {
  const attempts: (typeof EXAMPLE_JOB)[] = [];
  const failed: { payload: typeof EXAMPLE_JOB; attempts: number }[] = [];
  await runner.start([
    {
      "example.ran": {
        run: (payload) => {
          attempts.push(payload);
          return Promise.reject(new Error("Try again"));
        },
        onFailed: (payload) => {
          failed.push({ payload, attempts: attempts.length });
          return Promise.resolve();
        },
      },
    },
  ]);

  await transact((tx) => runner.queue.send(tx, "example.ran", EXAMPLE_JOB));

  await expect
    .poll(() => failed, { timeout: 15_000 })
    .toEqual([{ payload: EXAMPLE_JOB, attempts: 3 }]);
  expect(attempts).toEqual([EXAMPLE_JOB, EXAMPLE_JOB, EXAMPLE_JOB]);
});
