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
  /**
   * How long one attempt may run before it counts as expired and runs again; longer than its
   * slowest call, so a slow call is never sent twice. Two minutes by default.
   */
  expireInSeconds?: number;
}

export type JobHandlers = { [Name in JobName]?: JobHandler<Name> };

export interface JobQueue {
  /** Queues the job inside `tx`: a rollback drops it, the commit makes it runnable. */
  send<Name extends JobName>(tx: Tx, name: Name, payload: Jobs[Name]): Promise<void>;
}

/** Runs the modules' jobs in this process; their queue lives in Postgres. */
export interface JobRunner {
  queue: JobQueue;
  /** Creates the queues and starts working them; call after the migrations. Does nothing once stopped. */
  start(handlers: readonly JobHandlers[]): Promise<void>;
  /** Waits for a start in progress, lets running jobs finish for a while, then stops. */
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
  boss.on("error", (error) =>
    logger.error({ kind: (error as Error | undefined)?.constructor?.name }, "Job runner failed"),
  );
  let starting: Promise<void> | undefined;
  let stopping: Promise<void> | undefined;

  return {
    queue: {
      send: async (tx, name, payload) => {
        await boss.send(name, payload, { db: fromDrizzle(ormOf(tx), sql) });
      },
    },

    start: (handlers) => {
      if (stopping) {
        return Promise.resolve();
      }
      starting = startWorking(boss, handlers, retryDelaySeconds, logger);
      return starting;
    },

    stop: () => {
      stopping ??= (async () => {
        if (!starting) {
          return;
        }
        // A failed start still opened the pool, so it is stopped either way.
        await starting.catch(() => {});
        await boss.stop({ graceful: true, timeout: STOP_TIMEOUT_MS });
      })();
      return stopping;
    },
  };
}

/** Three attempts in all. */
const RETRY_LIMIT = 2;
const EXPIRE_IN_SECONDS = 120;
const STOP_TIMEOUT_MS = 10_000;
const CONCURRENCY = 2;

async function startWorking(
  boss: PgBoss,
  handlers: readonly JobHandlers[],
  retryDelaySeconds: number,
  logger: Logger,
): Promise<void> {
  await boss.start();
  for (const moduleHandlers of handlers) {
    for (const [name, handler] of Object.entries(moduleHandlers) as [
      JobName,
      JobHandler<JobName>,
    ][]) {
      await workQueue(boss, name, handler, retryDelaySeconds, logger);
    }
  }
}

async function workQueue(
  boss: PgBoss,
  name: JobName,
  handler: JobHandler<JobName>,
  retryDelaySeconds: number,
  logger: Logger,
): Promise<void> {
  const failedName = `${name}.failed`;
  await boss.createQueue(failedName);
  await boss.createQueue(name, {
    retryLimit: RETRY_LIMIT,
    retryDelay: retryDelaySeconds,
    retryBackoff: true,
    expireInSeconds: handler.expireInSeconds ?? EXPIRE_IN_SECONDS,
    deadLetter: failedName,
  });
  await boss.work<Jobs[JobName]>(name, { localConcurrency: CONCURRENCY }, async ([job]) => {
    try {
      await handler.run(job!.data);
    } catch (error) {
      logger.warn(
        {
          jobId: job!.id,
          jobName: name,
          retryCount: job!.retryCount,
          kind: (error as Error | undefined)?.constructor?.name,
        },
        "Job attempt failed",
      );
      throw error;
    }
  });
  await boss.work<Jobs[JobName]>(failedName, async ([job]) => {
    const failedLogger = logger.child({ jobId: job!.id, jobName: failedName });
    failedLogger.warn("Handling terminal job failure");
    try {
      await handler.onFailed(job!.data);
    } catch (error) {
      failedLogger.error(
        { kind: (error as Error | undefined)?.constructor?.name },
        "Terminal job failure handler failed",
      );
      throw error;
    }
  });
}
