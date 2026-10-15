import { sql } from "drizzle-orm";
import { fromDrizzle, PgBoss } from "pg-boss";

import { ormOf, type Tx } from "../db";
import type { Logger } from "../logger";

/** Every job by name and payload; modules add theirs by declaration merging. */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- filled by declaration merging.
export interface Jobs {}

export type JobName = keyof Jobs;

/** What a module does with its job. */
export interface JobHandler<Name extends JobName> {
  run(payload: Jobs[Name]): Promise<void>;
  /** After the last attempt failed, expired or died with the process. */
  onFailed(payload: Jobs[Name]): Promise<void>;
}

export type JobHandlers = { [Name in JobName]?: JobHandler<Name> };

export interface JobQueue {
  /** Queues the job inside `tx`: a rollback drops it, the commit makes it runnable. */
  send<Name extends JobName>(tx: Tx, name: Name, payload: Jobs[Name]): Promise<void>;
}

/** Runs the modules' jobs in this process; their queue lives in Postgres. */
export interface JobRunner {
  queue: JobQueue;
  /** Creates the queues and starts working them; call after the migrations. */
  start(handlers: readonly JobHandlers[]): Promise<void>;
  /** Lets running jobs finish for a while, then stops. */
  stop(): Promise<void>;
}

export function createJobRunner(
  databaseUrl: string,
  logger: Logger,
  { retryDelaySeconds = 5 }: { retryDelaySeconds?: number } = {},
): JobRunner {
  const boss = new PgBoss({
    connectionString: databaseUrl,
    max: 2,
    schedule: false,
  });
  boss.on("error", (error) => logger.error({ err: error }, "Job runner failed"));
  let started = false;

  return {
    queue: {
      send: async (tx, name, payload) => {
        await boss.send(name, payload, { db: fromDrizzle(ormOf(tx), sql) });
      },
    },

    start: async (handlers) => {
      await boss.start();
      started = true;
      for (const moduleHandlers of handlers) {
        for (const [name, handler] of Object.entries(moduleHandlers) as [
          JobName,
          JobHandler<JobName>,
        ][]) {
          await workQueue(boss, name, handler, retryDelaySeconds);
        }
      }
    },

    stop: async () => {
      if (started) {
        await boss.stop({ graceful: true, timeout: STOP_TIMEOUT_MS });
      }
    },
  };
}

/** Three attempts in all. */
const RETRY_LIMIT = 2;
const EXPIRE_IN_SECONDS = 120;
const STOP_TIMEOUT_MS = 10_000;
const CONCURRENCY = 2;

async function workQueue(
  boss: PgBoss,
  name: JobName,
  handler: JobHandler<JobName>,
  retryDelaySeconds: number,
): Promise<void> {
  const failedName = `${name}.failed`;
  await boss.createQueue(failedName);
  await boss.createQueue(name, {
    retryLimit: RETRY_LIMIT,
    retryDelay: retryDelaySeconds,
    retryBackoff: true,
    expireInSeconds: EXPIRE_IN_SECONDS,
    deadLetter: failedName,
  });
  await boss.work<Jobs[JobName]>(name, { localConcurrency: CONCURRENCY }, async ([job]) => {
    await handler.run(job!.data);
  });
  await boss.work<Jobs[JobName]>(failedName, async ([job]) => {
    await handler.onFailed(job!.data);
  });
}
