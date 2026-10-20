import { PgBoss } from "pg-boss";

import { EXAMPLE_JOB, expect, test as baseTest } from "#test/support";

import { createLogger } from "../logger";
import { createJobRunner, type JobRunner } from ".";

const test = baseTest.extend<{ runner: JobRunner; queues: PgBoss }>({
  runner: async ({ databaseUrl }, use) => {
    const runner = createJobRunner(databaseUrl, createLogger("silent"), { retryDelaySeconds: 0 });
    try {
      await use(runner);
    } finally {
      await runner.stop();
    }
  },
  queues: async ({ databaseUrl }, use) => {
    const queues = new PgBoss({ connectionString: databaseUrl, schedule: false });
    // Dropping the test database after the test ends the pool's connections, as the runner expects.
    queues.on("error", () => {});
    await queues.start();
    try {
      await use(queues);
    } finally {
      await queues.stop();
    }
  },
});

test.for([
  { state: "new", existing: false },
  { state: "existing", existing: true },
])("applies the handler's expiry to a $state queue", async ({ existing }, { runner, queues }) => {
  if (existing) {
    await queues.createQueue("example.ran", { expireInSeconds: 120 });
    expect(await queues.getQueue("example.ran")).toMatchObject({ expireInSeconds: 120 });
  }

  await runner.start([
    {
      "example.ran": {
        expireInSeconds: 360,
        run: () => Promise.resolve(),
        onFailed: () => Promise.resolve(),
      },
    },
  ]);

  expect(await queues.getQueue("example.ran")).toMatchObject({ expireInSeconds: 360 });
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

test("stopping during startup waits for startup and leaves no worker running", async ({
  runner,
  databaseUrl,
  transact,
}) => {
  const stoppedRunnerJobs: (typeof EXAMPLE_JOB)[] = [];
  const lifecycle: string[] = [];
  const starting = runner
    .start([
      {
        "example.ran": {
          run: (payload) => {
            stoppedRunnerJobs.push(payload);
            return Promise.resolve();
          },
          onFailed: () => {
            throw new Error("The job should succeed");
          },
        },
      },
    ])
    .then(() => lifecycle.push("started"));

  const stopping = runner.stop().then(() => lifecycle.push("stopped"));
  await Promise.all([starting, stopping]);

  expect(lifecycle).toEqual(["started", "stopped"]);
  const secondRunner = createJobRunner(databaseUrl, createLogger("silent"));
  const ran: (typeof EXAMPLE_JOB)[] = [];
  try {
    await secondRunner.start([
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
    await transact((tx) => secondRunner.queue.send(tx, "example.ran", EXAMPLE_JOB));

    await expect.poll(() => ran, { timeout: 5_000 }).toEqual([EXAMPLE_JOB]);
  } finally {
    await secondRunner.stop();
  }
  expect(stoppedRunnerJobs).toEqual([]);
});
