import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import express from "express";

import { connectDatabase, type Database } from "./db";
import type { Env } from "./env";
import { healthRouter } from "./health";
import type { Logger } from "./logger";
import { Readiness } from "./readiness";

/** How long to wait before retrying failed migrations, e.g. while Postgres boots. */
const MIGRATION_RETRY_MS = 1_000;

export type ServerEnv = Pick<Env, "databaseUrl" | "port" | "webDir">;

export interface RunningServer {
  url: string;
  /**
   * Stops accepting requests and closes the database, aborting a migration that is
   * still running; safe to call more than once.
   */
  stop(): Promise<void>;
}

/**
 * Starts listening at once and migrates the database in the background, retrying
 * until it succeeds; `/readyz` reports ready when the migrations have succeeded.
 */
export async function startServer(env: ServerEnv, logger: Logger): Promise<RunningServer> {
  const database = connectDatabase(env.databaseUrl, logger);
  const readiness = new Readiness(() => database.checkConnection());

  const app = express();
  app.disable("x-powered-by");
  app.use(healthRouter(readiness));
  if (env.webDir) {
    app.use(webAppRouter(env.webDir));
  }

  let httpServer: Server;
  try {
    httpServer = await listen(app, env.port);
  } catch (error) {
    await database.close();
    throw error;
  }

  const stopped = new AbortController();
  const migration = migrate(database, readiness, logger, stopped.signal);
  let stopping: Promise<void> | undefined;

  return {
    url: `http://localhost:${(httpServer.address() as AddressInfo).port}`,
    stop: () => {
      stopping ??= (async () => {
        stopped.abort();
        await close(httpServer);
        await database.close();
        await migration;
      })();
      return stopping;
    },
  };
}

async function migrate(
  database: Database,
  readiness: Readiness,
  logger: Logger,
  stopped: AbortSignal,
): Promise<void> {
  while (!stopped.aborted) {
    try {
      await database.migrate();
      readiness.markMigrated();
      logger.info("Database migrations applied");
      return;
    } catch (error) {
      if (stopped.aborted) {
        return;
      }
      readiness.markFailed();
      logger.error({ err: error }, "Database migrations failed; not ready, retrying");
    }
    await delay(MIGRATION_RETRY_MS, undefined, { signal: stopped }).catch(() => {});
  }
}

/** Serves the built web app; other GET paths get `index.html` so router links load. */
function webAppRouter(webDir: string): express.Router {
  // `sendFile` needs an absolute path.
  const indexHtml = resolve(webDir, "index.html");
  return express
    .Router()
    .use(express.static(webDir))
    .get("/{*path}", (_request, response) => {
      response.sendFile(indexHtml);
    });
}

function listen(app: express.Express, port: number): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = createServer(app);
    server.once("error", reject);
    server.listen(port, () => {
      server.off("error", reject);
      resolve(server);
    });
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}
