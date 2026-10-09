import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import express from "express";

import { connectDatabase, type Database } from "./db/index.js";
import type { Env } from "./env.js";
import { healthRouter } from "./health.js";
import type { Logger } from "./logger.js";
import { Readiness } from "./readiness.js";

export type ServerEnv = Pick<Env, "databaseUrl" | "port">;

export interface RunningServer {
  url: string;
  /**
   * Stops accepting requests and closes the database, aborting a migration that is
   * still running; safe to call more than once.
   */
  stop(): Promise<void>;
}

/**
 * Starts listening at once and migrates the database in the background; `/readyz`
 * reports ready when the migrations have succeeded.
 */
export async function startServer(env: ServerEnv, logger: Logger): Promise<RunningServer> {
  const database = connectDatabase(env.databaseUrl, logger);
  const readiness = new Readiness(() => database.checkConnection());

  const app = express();
  app.disable("x-powered-by");
  app.use(healthRouter(readiness));

  let httpServer: Server;
  try {
    httpServer = await listen(app, env.port);
  } catch (error) {
    await database.close();
    throw error;
  }

  const migration = migrate(database, readiness, logger);
  let stopping: Promise<void> | undefined;

  return {
    url: `http://localhost:${(httpServer.address() as AddressInfo).port}`,
    stop: () => {
      stopping ??= (async () => {
        await close(httpServer);
        await database.close();
        await migration;
      })();
      return stopping;
    },
  };
}

async function migrate(database: Database, readiness: Readiness, logger: Logger): Promise<void> {
  try {
    await database.migrate();
    readiness.markMigrated();
    logger.info("Database migrations applied");
  } catch (error) {
    readiness.markFailed();
    logger.error({ err: error }, "Database migrations failed; not ready");
  }
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
