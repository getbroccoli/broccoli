import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { toNodeHandler } from "better-auth/node";
import express from "express";

import { resolveActor } from "./actor";
import { createAuth } from "./auth";
import { connectDatabase, type Database } from "./db";
import type { Env } from "./env";
import { startGraphqlApi, type GraphqlApi } from "./graphql";
import { healthRouter } from "./health";
import { setupPlugin } from "./instance";
import type { Logger } from "./logger";
import type { ModuleDependencies, ModuleManifest } from "./module-manifest";
import { Readiness } from "./readiness";
import { readOrCreateSecret } from "./secrets";

/** How long to wait before retrying failed migrations, e.g. while Postgres boots. */
const MIGRATION_RETRY_MS = 1_000;

export type ServerEnv = Pick<
  Env,
  "databaseUrl" | "port" | "webDir" | "mode" | "dataDir" | "publicUrl"
>;

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
export async function startServer(
  env: ServerEnv,
  logger: Logger,
  createModules: (dependencies: ModuleDependencies) => readonly ModuleManifest[],
): Promise<RunningServer> {
  // Built first: a web app folder without `index.html` fails startup before anything opens.
  const webApp = env.webDir ? webAppRouter(env.webDir) : undefined;
  const authSecret = await readOrCreateSecret(env.dataDir, "auth-secret");
  const database = connectDatabase(env.databaseUrl, logger);
  const auth = createAuth({
    orm: database.orm,
    secret: authSecret,
    publicUrl: env.publicUrl,
    plugins: env.mode === "self_hosted" ? [setupPlugin(database.orm)] : [],
    logger,
  });
  const readiness = new Readiness(() => database.checkConnection());

  const app = express();
  app.disable("x-powered-by");
  const httpServer = createServer(app);
  let graphql: GraphqlApi;
  try {
    graphql = await startGraphqlApi(
      createModules({ orm: database.orm }),
      httpServer,
      logger,
      (headers) => resolveActor(auth, database.orm, headers),
    );
  } catch (error) {
    await database.close();
    throw error;
  }
  app.use(healthRouter(readiness));
  // Better Auth reads the raw body, so no body parser may run before it.
  app.all("/api/auth/{*path}", toNodeHandler(auth));
  app.use(graphql.router);
  if (webApp) {
    app.use(webApp);
  }
  try {
    await listen(httpServer, env.port);
  } catch (error) {
    await graphql.stop();
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
        // Drains in-flight requests, then closes the HTTP server.
        await graphql.stop();
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

/** Serves the built web app; other GET paths outside `/api` get `index.html` so router links load. */
function webAppRouter(webDir: string): express.Router {
  // `resolve` lets the folder be relative and sit inside hidden parent folders.
  const root = resolve(webDir);
  // Read once, so a page link costs no file system access.
  const indexHtml = readFileSync(join(root, "index.html"), "utf8");
  const router = express.Router().use(express.static(root));
  // API paths never get the web app, so an unknown one answers 404.
  router.use("/api", (_request, _response, next) => next("router"));
  return router.get("/{*path}", (_request, response) => {
    response.type("html").send(indexHtml);
  });
}

function listen(server: Server, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, () => {
      server.off("error", reject);
      resolve();
    });
  });
}
